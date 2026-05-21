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
  await expect(page.getByPlaceholder("Chiedi a Cesare…")).toBeVisible({
    timeout: 5_000,
  });
}

export async function sendCesareMessage(
  page: Page,
  text: string,
): Promise<void> {
  const input = page.getByPlaceholder("Chiedi a Cesare…");
  await input.click();
  await input.fill(text);
  await page.keyboard.press("Enter");
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
  await expect
    .poll(async () => (await log.locator("p").count()) >= 2, {
      timeout: 30_000,
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
