import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

/**
 * Open the floating Cesare chat sheet via the action bar pill.
 * The trigger label is either "Cesare" or "Cesare — N note" depending on the
 * pending-notes count, so we match both with a regex.
 */
export async function openCesareSheet(page: Page): Promise<void> {
  const trigger = page.getByRole("button", { name: /^Cesare(\s—.*)?$/ });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  const input = page.getByPlaceholder("Chiedi a Cesare…");
  await expect(input).toBeVisible({ timeout: 5_000 });
  // The sheet animates up via `transform` with --ds-duration-3 (250ms).
  // On slow CI runners React can re-render mid-animation, detaching the
  // textarea and breaking any interaction that races the transition.
  // Wait for the animation to settle before touching the input.
  await page.waitForTimeout(400);
}

export async function sendCesareMessage(
  page: Page,
  text: string,
): Promise<void> {
  const input = page.getByPlaceholder("Chiedi a Cesare…");
  await input.waitFor({ state: "visible", timeout: 10_000 });

  // On CI, `click()` (even with `force: true`) re-runs the viewport
  // check and trips on "Element is outside of the viewport" because the
  // Cesare sheet is positioned with `position: fixed; bottom: 0` while
  // the page underneath has scrolled away. Skip the click+viewport
  // dance entirely: focus + fill + dispatch is enough to drive the
  // React controlled input.
  await input.focus();
  await input.fill(text);
  await input.dispatchEvent("input");

  // On slow CI runners React occasionally hasn't reconciled the value
  // by the time we want to click send. Fall back to typing every key.
  let valueOk = false;
  try {
    await expect(input).toHaveValue(text, { timeout: 1_500 });
    valueOk = true;
  } catch {
    valueOk = false;
  }

  if (!valueOk) {
    await input.focus();
    await page.keyboard.type(text, { delay: 10 });
    await expect(input).toHaveValue(text, { timeout: 5_000 });
  }

  // Send button: scoped by aria-label="Invia" (CesareSheet SendButton).
  const sendBtn = page.getByRole("button", { name: "Invia" });
  await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  await sendBtn.click({ force: true });
}

/**
 * Wait for Cesare to finish responding and return the last assistant message
 * text. We watch the conversation log for a new assistant paragraph rather
 * than the send button — the button stays disabled while the textarea is
 * empty, which it always is after a send.
 */
export async function waitForCesareReply(page: Page): Promise<string> {
  const log = page.getByRole("log", { name: /Cesare/i });
  // The conversation log contains the user message immediately after send and
  // gains a second paragraph (assistant reply) when the server responds.
  // 60s timeout: tool-loop requests (estimate_scene_cost, read_scene) need
  // a server round-trip + a real DB query; on CI runners with cold vinxi
  // dev caches the first-after-start request can take 20-40s before the
  // route handler is JIT-compiled. Local runs return in ~2-3s.
  await expect
    .poll(async () => (await log.locator("p").count()) >= 2, {
      timeout: 60_000,
    })
    .toBe(true);
  const paragraphs = log.locator("p");
  const n = await paragraphs.count();
  if (n === 0) return "";
  return (await paragraphs.nth(n - 1).textContent()) ?? "";
}

/**
 * Seed the mock LLM scenario context. Tests call this before sending a Cesare
 * message so the mock can substitute {{REQ_ID}}, {{SCENE_NUMBER}} etc into the
 * scripted tool inputs at request time.
 *
 * The server-side setter persists across the whole request — keep it tight to
 * one test by passing the full context up front.
 */
export async function setMockContext(
  page: Page,
  ctx: Record<string, string | number>,
): Promise<void> {
  const stringified: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) {
    stringified[k] = String(v);
  }
  const response = await page.request.post(
    `${BASE_URL}/api/test/mock-context`,
    {
      data: { context: stringified },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `setMockContext failed: ${response.status()} ${response.statusText()}`,
    );
  }
}

export async function clearMockContext(page: Page): Promise<void> {
  await page.request.post(`${BASE_URL}/api/test/mock-context`, {
    data: { context: {} },
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Wipe transient screenplay state for a project (draft versions left over from
 * a previous Cesare proposal, in-memory PROPOSAL_STORE bucket). Tests call
 * this in `beforeEach` so a draft-banner widget from a prior test cannot
 * intercept clicks on the Cesare textarea in the next one.
 */
export async function resetScreenplayState(
  page: Page,
  projectId: string,
): Promise<void> {
  const response = await page.request.post(
    `${BASE_URL}/api/test/reset-screenplay-state`,
    {
      data: { projectId },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `resetScreenplayState failed: ${response.status()} ${response.statusText()}`,
    );
  }
}
