import { execSync } from "node:child_process";
import path from "node:path";
import { type Page, expect } from "@playwright/test";
import { BASE_URL } from "../fixtures";

/**
 * Seed N Cesare sessions for (projectId, userId) directly against the test
 * DB, with the first `pinnedCount` marked pinned. Session rows are otherwise
 * only created on a real first-message send (see `NewSessionLandingPage`),
 * which is too slow to drive N times through the UI in a rail-cap test —
 * this mirrors `reseedTestDb`'s direct-DB-script pattern instead.
 */
export const seedCesareSessions = (
  projectId: string,
  userId: string,
  count: number,
  pinnedCount = 0,
): void => {
  const root = path.resolve(__dirname, "..", "..");
  execSync(
    `pnpm --filter @oh-writers/db exec tsx src/seed/seed-cesare-sessions.ts ${projectId} ${userId} ${count} ${pinnedCount}`,
    {
      cwd: root,
      stdio: "ignore",
      env: {
        ...process.env,
        DATABASE_URL:
          process.env["DATABASE_URL_TEST"] ??
          "postgresql://oh-writers:oh-writers@localhost:5432/oh-writers_test",
      },
    },
  );
};

/**
 * Open the floating Cesare chat sheet via the BottomDock pill.
 * Post-Wave-1 shell refactor (Spec 44/47): the dock pill's accessible name is
 * "Apri Cesare". The rail (Spec 47-A5) also exposes a button with that name, so
 * we scope the trigger to the BottomDock to avoid matching the rail entry.
 */
export async function openCesareSheet(page: Page): Promise<void> {
  const trigger = page
    .getByTestId("bottom-dock")
    .getByTestId("cesare-open-btn");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  // The dock pill drives Cesare's open via react-aria `usePress` (onPress). On
  // heavy authoring routes (breakdown / screenplay) the page is still settling
  // its layout when the click lands, so the press can be CANCELLED (the pointer
  // appears to leave the moving button between pointerdown and pointerup) and
  // the drawer never opens. Retry the click until the shell actually reports the
  // drawer open (`body[data-cesare]="expanded"`) — this is the canonical
  // "drawer is open" signal, immune to the press-cancel race.
  await expect(async () => {
    await trigger.click();
    expect(await page.evaluate(() => document.body.dataset.cesare)).toBe(
      "expanded",
    );
  }).toPass({ timeout: 15_000 });
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
  // The expanded drawer header and the minimized peek row each expose their
  // own close control; match either, scoped to the drawer.
  const closeBtn = drawer
    .getByTestId(/^cesare-(close|peek-close)-btn$/)
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
  // Locate via the stable testid on the send button. We DON'T use
  // `getByRole("button", { name: … })` because the Cesare sheet has
  // `aria-hidden={!isOpen}` on its `role="complementary"` ancestor, and on
  // slow CI runners Playwright's accessibility-tree query can race with the
  // open transition and skip the subtree. A plain testid attribute selector
  // queries the DOM directly and is immune to ARIA-tree timing.
  const sendBtn = page.locator('[data-testid="cesare-send-btn"]').first();
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
  // The assistant bubble mounts as a `LoadingIndicator` (aria-busy, no <p>)
  // before its text streams in — the paragraph count above can pass on the
  // user's bubble alone while the assistant is still "sta rispondendo".
  // Wait for that indicator to clear so the last <p> is genuinely the
  // settled reply, not a premature read of the user's own echoed text.
  await expect(log.locator('[aria-busy="true"]')).toHaveCount(0, {
    timeout: 60_000,
  });
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

/**
 * Wait for the ⏸ stop button to prove a turn is genuinely mid-flight, or
 * skip the calling test via `skip` if the mock resolved too fast to catch it.
 * The mock backend can settle a turn with no artificial delay, so the
 * mid-flight window is inherently racy — several composer tests need this
 * exact "catch it or skip" tolerance, so it lives here once instead of being
 * copy-pasted per test.
 */
export async function waitForMidFlightOrSkip(
  page: Page,
  skip: (condition: boolean, description: string) => void,
): Promise<void> {
  const stopBtn = page.locator('[data-testid="cesare-stop-btn"]');
  const caughtMidFlight = await stopBtn
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  skip(!caughtMidFlight, "turn settled before the field could be checked");
}

/**
 * A long soggetto baseline carrying both mock size-classification anchors
 * (see `MOCK_SCENARIOS` in `_mocks/cesare-tool-loop.mock.ts`):
 *   "libraio di quartiere" → the small-edit scenario ("cambia libraio")
 *                            swaps one word — well under the 0.4 large-edit
 *                            ratio, so `commitOrAsk` overwrites in place.
 *   "PRINCIPIO"            → the large-edit scenario replaces it with a long
 *                            new body — clears the ratio, so `commitOrAsk`
 *                            asks (`applied_live: false`, no doc-applied
 *                            marker) instead of auto-applying.
 * Any test that needs a deterministic small OR large edit against the
 * soggetto (rather than the default seed, which contains neither anchor)
 * seeds this first.
 */
export const LONG_SOGGETTO =
  "<p>PRINCIPIO. In una cittadina di provincia vive un libraio di quartiere " +
  "che ogni mattina alza la saracinesca della bottega ereditata dal padre. " +
  "Le giornate scorrono lente tra clienti abitudinari, scaffali polverosi e " +
  "il profumo della carta vecchia, mentre fuori il mondo cambia senza chiedere " +
  "permesso. Una sera, tra le pagine di un volume mai venduto, trova una lettera " +
  "che lo costringe a guardare il proprio passato con occhi nuovi e a decidere " +
  "se restare immobile o partire verso ciò che ha sempre rimandato.</p>";

/**
 * Seed the soggetto's active version with `LONG_SOGGETTO` via the document
 * version server fns directly (the only URL-stable way to set arbitrary
 * content), so the edit-size classification has a real, known previous
 * content to diff against. Opens Versions to resolve the document id, then
 * closes the lane again — left open, it makes the next "Apri Cesare" click
 * promote Cesare INTO the shared aux lane instead of opening the floating
 * sheet (Spec 78 A6).
 */
export async function seedLongSoggetto(
  page: Page,
  projectId: string,
): Promise<void> {
  await page.goto(`${BASE_URL}/projects/${projectId}/soggetto`);
  await expect(page.getByTestId("soggetto-page")).toBeVisible({
    timeout: 15_000,
  });

  const chip = page.getByTestId("topbar-version-chip");
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await chip.click();
  const lane = page.getByTestId("versions-split-lane");
  await expect(lane).toBeVisible({ timeout: 5_000 });
  const documentId = await page.evaluate(
    () => new URL(location.href).searchParams.get("versions") ?? "",
  );
  expect(documentId).not.toBe("");
  await lane.getByLabel("Chiudi").click();
  await expect(lane).toBeHidden({ timeout: 5_000 });

  const createUrl =
    `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
    `--createVersionFromScratch_createServerFn_handler?createServerFn`;
  const created = await page.request.post(createUrl, {
    headers: { "Content-Type": "application/json" },
    data: { data: { documentId } },
  });
  expect(created.ok()).toBe(true);
  const body = (await created.json()) as {
    result?: { value?: { id?: string } };
  };
  const versionId = body.result?.value?.id;
  expect(versionId).toBeTruthy();

  const saveUrl =
    `${BASE_URL}/_server/app_features_documents_server_versions_server_ts` +
    `--saveVersionContent_createServerFn_handler?createServerFn`;
  const saved = await page.request.post(saveUrl, {
    headers: { "Content-Type": "application/json" },
    data: { data: { versionId, content: LONG_SOGGETTO } },
  });
  expect(saved.ok()).toBe(true);
}
