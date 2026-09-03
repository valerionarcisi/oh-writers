// tests/auth.spec.ts
//
// End-to-end coverage for the account lifecycle (Spec #127 / better-auth):
// signup, email verification (without a live SMTP — the verify JWT is minted
// here with node crypto against the app's BETTER_AUTH_SECRET), the
// requireEmailVerification sign-in gate, password reset (the reset token is
// read from the test DB `verifications` table), change password, and account
// deletion. The test SMTP path itself is covered by the mailer unit test
// (packages/auth/src/mailer.test.ts); this spec exercises the AUTH contract
// end to end against the real routes.
//
// These tests run in the `chromium` project against the dedicated test DB
// (`oh-writers_test`), re-seeded each run by global-setup. Users are created
// with unique emails so runs are independent.
import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { createHmac } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";

// `postgres` is a workspace dep of @oh-writers/db (via pnpm, not resolvable
// from tests/). createRequire against the db package dir reaches it, letting
// the spec read the reset token better-auth stores in `verifications` without
// a live SMTP.
const requireFromDb = createRequire(
  path.join(process.cwd(), "packages/db/placeholder.js"),
);
const postgres = requireFromDb("postgres") as {
  (url: string): {
    <T extends unknown[]>(
      strings: TemplateStringsArray,
      ...values: T
    ): Promise<unknown>;
    end: () => Promise<void>;
  };
};

const TEST_DB_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test";

// The webServer inherits BETTER_AUTH_SECRET from apps/web/.env (it does not
// override it in playwright.config.ts), so the verify JWT must be signed with
// the same value to be accepted by better-auth's audit. It is a dev secret,
// safe to mirror here for the test to reach the contract.
const BETTER_AUTH_SECRET =
  process.env["BETTER_AUTH_SECRET"] ?? "change-me-in-production-min-32-chars";

const jsonFetch = (path: string, init: RequestInit = {}) =>
  fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      ...(init.headers ?? {}),
    },
  });

// Mint the same HS256 JWT better-auth creates for email verification
// (signJWT in better-auth/dist/crypto/jwt.mjs: HS256 + issuedAt + exp).
const rawsignVerifyToken = (
  email: string,
  secret: string,
  ttlSec = 3600,
): string => {
  const b64url = (buf: Buffer) =>
    buf
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        email: email.toLowerCase(),
        iat: now,
        exp: now + ttlSec,
      }),
    ),
  );
  const sig = b64url(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${sig}`;
};

const fetchResetToken = async (email: string): Promise<string | null> => {
  const sql = postgres(TEST_DB_URL);
  try {
    // better-auth stores `identifier: reset-password:{token}` with `value` =
    // the user id — so the token must be recovered by joining the user's email.
    const rows = (await sql`
      SELECT v."identifier"
      FROM verifications v
      JOIN users u ON u.id = v."value"::uuid
      WHERE u.email = ${email}
        AND v."identifier" LIKE 'reset-password:%'
      ORDER BY v."created_at" DESC
      LIMIT 1
    `) as Array<{ identifier: string }>;
    const idf = rows[0]?.identifier;
    return idf ? idf.replace("reset-password:", "") : null;
  } finally {
    await sql.end();
  }
};

const uniqueEmail = () =>
  `auth.spec-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

test.describe("account lifecycle (auth)", () => {
  test("signup + verify email: sign-in is gated until the email is verified", async () => {
    const email = uniqueEmail();
    const password = "AuthTest123!";

    // Sign up a brand-new account.
    const signup = await jsonFetch("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name: "Auth Spec" }),
    });
    expect(signup.status, `signup status ${signup.status}`).toBeLessThan(400);

    // requireEmailVerification: an unverified account must NOT be able to sign in.
    const blocked = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    expect(blocked.status).toBe(403);

    // Verify the email by hitting the real verify route with a minted JWT
    // (the equivalent of the link in the sent email).
    const token = rawsignVerifyToken(email, BETTER_AUTH_SECRET);
    const verify = await jsonFetch(
      `/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=%2F`,
    );
    expect([200, 302], `verify status ${verify.status}`).toContain(
      verify.status,
    );

    // After verification, sign-in succeeds.
    const signedIn = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    expect(signedIn.status, `signin after verify ${signedIn.status}`).toBe(200);
    expect(signedIn.headers.get("set-cookie")).toContain("session");
  });

  test("password reset: request → token in DB → set new password → sign in with it", async () => {
    const email = uniqueEmail();
    const password = "AuthTest123!";
    const newPassword = "AuthReset456!";

    // Create a verified user (verify immediately after signup).
    const signup = await jsonFetch("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name: "Reset Spec" }),
    });
    expect(signup.status).toBeLessThan(400);
    const verifyTok = rawsignVerifyToken(email, BETTER_AUTH_SECRET);
    await jsonFetch(
      `/api/auth/verify-email?token=${verifyTok}&callbackURL=%2F`,
    );

    // Request a reset — better-auth stores the token in `verifications`.
    const request = await jsonFetch("/api/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    expect(request.status).toBe(200);

    const token = await fetchResetToken(email);
    expect(token, "reset token persisted in verifications").toBeTruthy();

    // Set the new password with the DB-backed token (no email round-trip).
    const reset = await jsonFetch("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ newPassword, token: token as string }),
    });
    expect(reset.status, `reset status ${reset.status}`).toBe(200);

    // Old password fails, new one signs in.
    const oldTry = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    expect(oldTry.status).toBe(401);
    const newTry = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: newPassword }),
    });
    expect(newTry.status, `sign-in with new pwd ${newTry.status}`).toBe(200);
  });

  test("password reset UI: forgot-password link → request form → reset-password page → sign in with new password", async ({
    page,
  }) => {
    // Distinct from the API-only reset test above (Spec 88 gap): the email
    // link points at a UI route (/reset-password?token=...), not the raw
    // better-auth API endpoint — that route didn't exist before this fix.
    const email = uniqueEmail();
    const password = "AuthTest123!";
    const newPassword = "AuthUiReset456!";

    const signup = await jsonFetch("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name: "Reset UI Spec" }),
    });
    expect(signup.status).toBeLessThan(400);
    const verifyTok = rawsignVerifyToken(email, BETTER_AUTH_SECRET);
    await jsonFetch(
      `/api/auth/verify-email?token=${verifyTok}&callbackURL=%2F`,
    );

    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/^email/i).fill(email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("link", { name: /forgot password/i }).click();
    await page.waitForURL("**/forgot-password");

    await page.getByLabel(/^email/i).fill(email);
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByText(/check your email/i)).toBeVisible();

    // Real SMTP delivery is out of scope here (covered by the mailer unit
    // test + the manual Mailtrap check) — read the token better-auth
    // persisted in `verifications`, then drive the real UI route with it,
    // exactly as the emailed link would.
    const token = await fetchResetToken(email);
    expect(token, "reset token persisted in verifications").toBeTruthy();

    await page.goto(`/reset-password?token=${token}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: /choose a new password/i }),
    ).toBeVisible();
    await page.getByLabel(/new password/i).fill(newPassword);
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page.getByText(/password has been reset/i)).toBeVisible();

    const oldTry = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    expect(oldTry.status).toBe(401);
    const newTry = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: newPassword }),
    });
    expect(newTry.status, `sign-in with new pwd ${newTry.status}`).toBe(200);
  });

  test("reset-password page shows an error for a missing/invalid token", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();

    await page.goto("/reset-password?token=not-a-real-token");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: /choose a new password/i }),
    ).toBeVisible();
    await page.getByLabel(/new password/i).fill("SomeNewPass123!");
    await page.getByRole("button", { name: /reset password/i }).click();
    // better-auth rejects the bogus token at submit time — the page must
    // surface that as an apiError and stay on the form, not navigate away or
    // show success.
    await expect(
      page.getByText(/invalid|expired|failed to reset/i),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /choose a new password/i }),
    ).toBeVisible();
  });

  test("change password as the signed-in user", async ({ browser }) => {
    // Use a fresh user so the seeded test@ohwriters.dev fixture is untouched
    // (change-password mutates the account's credential).
    const email = uniqueEmail();
    const oldPassword = "AuthTest123!";
    const newPassword = "ChangedPwd789!";

    await jsonFetch("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({
        email,
        password: oldPassword,
        name: "Change Spec",
      }),
    });
    const verifyTok = rawsignVerifyToken(email, BETTER_AUTH_SECRET);
    await jsonFetch(
      `/api/auth/verify-email?token=${verifyTok}&callbackURL=%2F`,
    );

    // Log in via API to get a fresh session cookie (better-auth requires a
    // fresh session for change-password).
    const ctx = await browser.newContext();
    const signIn = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: oldPassword }),
    });
    const cookieHeader = (signIn.headers.get("set-cookie") ?? "")
      .split(";")[0]
      ?.trim();
    expect(cookieHeader).toBeTruthy();

    const change = await fetch(`${BASE_URL}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Cookie: cookieHeader as string,
      },
      body: JSON.stringify({ currentPassword: oldPassword, newPassword }),
    });
    expect(change.status, `change-password status ${change.status}`).toBe(200);

    // Old password now rejected, new password accepted.
    const oldTry = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: oldPassword }),
    });
    expect(oldTry.status).toBe(401);
    const newTry = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password: newPassword }),
    });
    expect(newTry.status, `sign-in with new pwd ${newTry.status}`).toBe(200);
    await ctx.close();
  });

  test("delete account removes the user", async ({ browser }) => {
    // Create a fresh user (leave the seeded fixtures untouched).
    const email = uniqueEmail();
    const password = "AuthTest123!";
    await jsonFetch("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name: "Delete Spec" }),
    });
    const verifyTok = rawsignVerifyToken(email, BETTER_AUTH_SECRET);
    await jsonFetch(
      `/api/auth/verify-email?token=${verifyTok}&callbackURL=%2F`,
    );

    // Sign in to get a session, then delete the account with it.
    const signin = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const setCookie = signin.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(setCookie).toBeTruthy();

    const del = await fetch(`${BASE_URL}/api/auth/delete-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Cookie: setCookie,
      },
      body: "{}",
    });
    expect(del.status).toBe(200);
    const body = (await del.json()) as { success?: boolean; message?: string };
    expect(body.success).toBe(true);

    // After deletion the account can no longer sign in.
    const gone = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    expect(gone.status).toBe(401);
  });

  test("delete account UI: section + confirm dialog + redirect to /login", async ({
    browser,
  }) => {
    // Fresh user so the seeded fixture is untouched.
    const email = uniqueEmail();
    const password = "AuthTest123!";
    await jsonFetch("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name: "Delete UI Spec" }),
    });
    const verifyTok = rawsignVerifyToken(email, BETTER_AUTH_SECRET);
    await jsonFetch(
      `/api/auth/verify-email?token=${verifyTok}&callbackURL=%2F`,
    );

    // Sign in via API, plant the session cookie in a fresh browser context,
    // then open /settings — the Delete section must be present.
    const signin = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const setCookieHeaders = signin.headers.get("set-cookie") ?? "";
    const cookie = setCookieHeaders.split(";")[0]?.trim();
    expect(cookie).toBeTruthy();

    const ctx = await browser.newContext();
    const [name, value] = cookie!.split("=") as [string, string];
    await ctx.addCookies([{ name, value, url: BASE_URL }]);
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/settings`);
    await expect(page.getByTestId("delete-account-section")).toBeVisible({
      timeout: 15_000,
    });

    // Clicking the delete button opens the confirm dialog. Hydration race
    // guard: the delete button exists server-side before React attaches onClick,
    // so a single click can land on a handler-less button — retry until a
    // native <dialog> is actually open (showModal fired).
    await expect
      .poll(
        async () => {
          await page.getByTestId("delete-account-btn").click({ force: true });
          await page.waitForTimeout(200);
          return (await page.locator("dialog[open]").count()) > 0;
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toContainText("Delete account?");
    await expect(page.getByTestId("confirm-dialog-confirm-btn")).toBeVisible();

    // Confirming deletes the account and redirects to the login page.
    await page.getByTestId("confirm-dialog-confirm-btn").click();
    await page.waitForURL("**/login", { timeout: 15_000 });

    // The account is gone: sign-in now fails.
    const gone = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    expect(gone.status).toBe(401);
    await ctx.close();
  });

  test("delete account is blocked when the user is the sole owner of a team with a pending invitation (GH #137)", async ({
    browser,
  }) => {
    // Fresh owner so the seeded "Test Team" fixture is untouched.
    const email = uniqueEmail();
    const password = "AuthTest123!";
    await jsonFetch("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name: "Team Owner Spec" }),
    });
    const verifyTok = rawsignVerifyToken(email, BETTER_AUTH_SECRET);
    await jsonFetch(
      `/api/auth/verify-email?token=${verifyTok}&callbackURL=%2F`,
    );

    const signin = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const setCookieHeaders = signin.headers.get("set-cookie") ?? "";
    const cookie = setCookieHeaders.split(";")[0]?.trim();
    expect(cookie).toBeTruthy();

    const ctx = await browser.newContext();
    const [cookieName, cookieValue] = cookie!.split("=") as [string, string];
    await ctx.addCookies([
      { name: cookieName, value: cookieValue, url: BASE_URL },
    ]);
    const page = await ctx.newPage();

    // Create a team (the fresh user becomes its sole owner) and invite
    // someone else — the invitation alone (accepted or not) is enough to
    // block deletion, since the invite still references invitedBy = this user.
    // Fresh signups default to the English locale (see users.locale), unlike
    // the seeded fixtures used elsewhere — this page renders in English.
    await page.goto("/teams/new");
    const uniqueName = `Owner Guard Team ${Date.now()}`;
    const nameInput = page.getByLabel("Team name");
    await nameInput.click();
    await nameInput.pressSequentially(uniqueName, { delay: 20 });
    const createBtn = page.getByRole("button", { name: "Create team" });
    await expect(createBtn).toBeEnabled({ timeout: 5_000 });
    await createBtn.click();
    // "new" itself matches a naive /teams/[a-z0-9-]+ pattern, so wait for the
    // dashboard heading (post-navigation) rather than the URL alone.
    await page.waitForURL(/\/teams\/(?!new$)[a-z0-9-]+$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10_000,
    });
    const teamSlug = new URL(page.url()).pathname.split("/").pop();

    await page.goto(`/teams/${teamSlug}/members`);
    const inviteEmail = `owner-guard-invite-${Date.now()}@example.com`;
    const emailInput = page.getByPlaceholder("email@example.com");
    const inviteBtn = page.getByRole("button", { name: "Invite" });
    await expect(async () => {
      await emailInput.fill(inviteEmail);
      await expect(inviteBtn).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await inviteBtn.click();
    await expect(
      page.getByTestId("invitations-list").getByText(inviteEmail),
    ).toBeVisible({ timeout: 8_000 });

    // The API rejects the deletion with a clear message instead of a raw FK
    // violation, and the account survives (still able to sign in).
    const del = await fetch(`${BASE_URL}/api/auth/delete-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Cookie: cookie!,
      },
      body: "{}",
    });
    expect(del.status).toBe(400);
    const delBody = (await del.json()) as { message?: string };
    expect(delBody.message ?? "").toMatch(/sole owner|team/i);

    const stillThere = await jsonFetch("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    expect(stillThere.status).toBe(200);
    await ctx.close();
  });
});
