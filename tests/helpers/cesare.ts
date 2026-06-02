import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

/**
 * Open the floating Cesare chat sheet via the BottomDock pill.
 * Post-Wave-1 shell refactor (Spec 44/47): the dock pill's accessible name is
 * "Apri Cesare". The rail (Spec 47-A5) also exposes a button with that name, so
 * we scope the trigger to the BottomDock to avoid matching the rail entry.
 */
export async function openCesareSheet(page: Page): Promise<void> {
  const trigger = page
    .getByTestId("bottom-dock")
    .getByRole("button", { name: "Apri Cesare" });
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

/**
 * Close the floating Cesare drawer. After the Notion v3 shell refactor (Spec
 * 44) Cesare is a floating bottom-right surface (`data-surface="floating"`)
 * that overlays the page. When a flow opens Cesare to send a prompt and then
 * needs to interact with an in-page accept affordance (a screenplay
 * proposal-accept widget, a blocking-proposal panel button), the open drawer
 * can geometrically intercept the click — exactly as a user would dismiss the
 * chat to act on the proposal, the test closes the drawer first.
 */
export async function closeCesareSheet(page: Page): Promise<void> {
  const drawer = page.getByTestId("cesare-drawer");
  // The expanded drawer header exposes a close control labelled "Chiudi"
  // (the peek row uses "Chiudi Cesare"); match either, scoped to the drawer.
  const closeBtn = drawer
    .getByRole("button", { name: /^Chiudi( Cesare)?$/ })
    .first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
    await expect(drawer).toHaveAttribute("data-state", "closed", {
      timeout: 5_000,
    });
  }
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

  // Send button: same viewport issue as the textarea — Playwright's
  // click viewport check fires even with `force: true` on this CI
  // version. Dispatch the click event in JS to bypass coords entirely.
  // Locate via the explicit aria-label on the send button. We DON'T use
  // `getByRole("button", { name: "Invia" })` because the Cesare sheet has
  // `aria-hidden={!isOpen}` on its `role="complementary"` ancestor, and on
  // slow CI runners Playwright's accessibility-tree query can race with the
  // open transition and skip the subtree. A plain CSS attribute selector
  // queries the DOM directly and is immune to ARIA-tree timing.
  // Post-Wave-1: the send button's aria-label is "Invia messaggio".
  const sendBtn = page.locator('[aria-label="Invia messaggio"]').first();
  await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
  await sendBtn.dispatchEvent("click");
}

/**
 * Wait for Cesare to finish responding and return the last assistant message
 * text. We watch the conversation log for the assistant `<p>` paragraph
 * rather than the send button — the button stays disabled while the
 * textarea is empty, which it always is after a send.
 *
 * Locator note: we deliberately AVOID `getByRole("log", { name: /Cesare/i })`.
 * The Cesare sheet sets `aria-hidden={!isOpen}` on its `role="complementary"`
 * wrapper; on slow CI runners Playwright's accessibility-tree query can race
 * with the open transition and treat the entire subtree as a11y-hidden,
 * making `getByRole` return zero matches even after both `<p>` paragraphs
 * are present in the DOM. A plain CSS attribute selector queries the raw DOM
 * and is immune to that race.
 */
export async function waitForCesareReply(page: Page): Promise<string> {
  // Post-Wave-1 the conversation container carries `data-testid="cesare-
  // conversation"` (the old role="log"/aria-label markup was removed when the
  // chat moved to `useCesareChat`). A test-id selector queries the raw DOM, so
  // aria-hidden on an ancestor during the open transition does NOT mask it.
  const log = page.getByTestId("cesare-conversation");
  // Both bubbles render at least one <p>:
  //   - user bubble: <p class={bubbleText}>{content}</p>
  //   - assistant bubble: renderMarkdown(...) which wraps each line in
  //     <p class={mdPara}>...</p>
  // So once the assistant reply arrives we have >= 2 paragraphs total.
  // 60s timeout: tool-loop requests (estimate_scene_cost, read_scene) need
  // a server round-trip + a real DB query; on CI runners with cold vinxi
  // dev caches the first-after-start request can take 20-40s before the
  // route handler is JIT-compiled. Local runs return in ~2-3s.
  const paragraphs = log.locator("p");
  await expect
    .poll(async () => await paragraphs.count(), {
      timeout: 60_000,
    })
    .toBeGreaterThanOrEqual(2);
  const n = await paragraphs.count();
  if (n === 0) return "";
  return (await paragraphs.nth(n - 1).textContent()) ?? "";
}

/**
 * The mock emits this faithful-failure text when a tool ran but its preceding
 * tool_result carried an error (e.g. expand_section reading a document whose
 * content hasn't propagated to the request's projectDocuments yet on a slow CI
 * runner). It is a transient, environment-timing failure — the content settles
 * a beat later — so a single resend clears it.
 */
export const TRANSIENT_FAILURE_RE =
  /non c'era abbastanza materiale|non sono riuscito a completare/i;

/**
 * Send a Cesare message and return the reply, retrying ONCE if the first reply
 * is the known transient empty-context failure. This closes a CI-only race in
 * the agentic suite (DB seed vs server-side document read) without touching
 * product code. Use for tool turns that depend on freshly-seeded entity state.
 */
export async function sendCesareWithRetry(
  page: Page,
  text: string,
): Promise<string> {
  await sendCesareMessage(page, text);
  let reply = await waitForCesareReply(page);
  if (TRANSIENT_FAILURE_RE.test(reply)) {
    await page.waitForTimeout(1_500);
    await sendCesareMessage(page, text);
    reply = await waitForCesareReply(page);
  }
  return reply;
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

/**
 * Restore a project to a clean Cesare-agentic baseline between Playwright
 * tests. Since Spec 51 the Cesare chat persists `cesare_sessions` /
 * `cesare_messages`, and every agentic edit mutates the open document + a new
 * `document_versions` row. The mock-ui project runs serially against one shared
 * test DB, so a prior agentic test would otherwise leak its document mutations
 * and built-up session history into the next test. Call this in `beforeEach` of
 * every cesare-agentic spec so each test starts from the seed state.
 */
export async function resetCesareState(
  page: Page,
  projectId: string,
): Promise<void> {
  const response = await page.request.post(
    `${BASE_URL}/api/test/reset-cesare-state`,
    {
      data: { projectId },
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `resetCesareState failed: ${response.status()} ${response.statusText()}`,
    );
  }
}
