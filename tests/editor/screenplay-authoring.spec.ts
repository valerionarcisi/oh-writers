/**
 * Spec 07d — E2E Screenplay Authoring (full user story)
 *
 * The seeded E2E user writes a complete short film screenplay from scratch:
 *   - Creates a new project
 *   - Adds three scenes with headings (prefix + title)
 *   - Writes action, character, dialogue, parenthetical and transition blocks
 *   - Verifies character autocomplete
 *   - Verifies the Fountain round-trip (what was typed = what the serialiser emits)
 *
 * Uses the seeded test user (test@ohwriters.dev / testpassword123) in a fresh
 * project created in beforeAll. The project is left alive for manual inspection.
 *
 * Keyboard conventions used throughout:
 *   Alt+s  → setElement("scene")   — creates a new scene heading at the cursor
 *   Alt+a  → setElement("action")
 *   Alt+c  → setElement("character")
 *   Alt+d  → setElement("dialogue")
 *   Alt+p  → setElement("parenthetical")
 *   Alt+t  → setElement("transition")
 *   Space  → inside prefix: hops cursor to title (no space inserted)
 *   Enter  → from heading title: inserts an action block below
 *   Enter  → from character: creates dialogue
 *   Enter  → from dialogue with text: creates another dialogue (same character)
 *   Enter  → from empty dialogue: converts block to action (double-Enter breakout)
 */

import { test, expect, type Page, type Browser } from "@playwright/test";
import { BASE_URL, goToNewLine } from "../helpers";

// ─── Auth constants (seeded user) ─────────────────────────────────────────────
const TEST_EMAIL = "test@ohwriters.dev";
const TEST_PASSWORD = "testpassword123";

// ─── State shared across tests in this suite ──────────────────────────────────
let projectId = "";
let authCookies: {
  name: string;
  value: string;
  domain: string;
  path: string;
}[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function signInViaApi(email: string, password: string) {
  const resp = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new Error(`Sign-in failed: ${resp.status}`);
  return resp.headers
    .getSetCookie()
    .map((header) => {
      const [nameValue] = header.split(";");
      if (!nameValue) return null;
      const eqIdx = nameValue.indexOf("=");
      if (eqIdx === -1) return null;
      return {
        name: nameValue.substring(0, eqIdx),
        value: nameValue.substring(eqIdx + 1),
        domain: "localhost",
        path: "/",
      };
    })
    .filter(Boolean) as {
    name: string;
    value: string;
    domain: string;
    path: string;
  }[];
}

async function openAuthenticatedPage(browser: Browser) {
  const ctx = await browser.newContext();
  if (authCookies.length) await ctx.addCookies(authCookies);
  return ctx.newPage();
}

/** Wait for the ProseMirror editor to be ready and click into it. */
async function waitForEditor(page: Page) {
  const editor = page.locator(".ProseMirror").first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  return editor;
}

/**
 * Type text in the current block, then wait for the async docToFountain
 * serialisation to update window.__ohWritersFountain before we read it.
 */
async function typeAndSettle(page: Page, text: string, extraWait = 0) {
  await page.keyboard.type(text);
  // docToFountain is loaded via dynamic import; the Promise resolves in the
  // next micro-task after the PM transaction. 200 ms is ample.
  await page.waitForTimeout(200 + extraWait);
}

/**
 * Trigger an immediate save (bypasses the 30-second auto-save debounce) and
 * wait for the network request to complete. Call before page.context().close()
 * in data-writing tests so subsequent tests load the saved content from DB.
 */
async function forceSave(page: Page) {
  await page.evaluate(() => (window as any).__ohWritersForceSave?.());
  await page.waitForTimeout(1_500);
}

/** Read the current Fountain text from the editor. */
async function getFountain(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__ohWritersFountain?.() ?? "");
}

/**
 * Read the resolved class of the node currently holding the browser selection.
 * Returns the first ancestor element that carries a pm-* class.
 */
async function focusedPmClass(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as { __ohWritersBlock?: () => string | null };
    const type = w.__ohWritersBlock?.() ?? "";
    const map: Record<string, string> = {
      prefix: "pm-heading-prefix",
      title: "pm-heading-title",
      heading: "pm-heading",
      action: "pm-action",
      character: "pm-character",
      dialogue: "pm-dialogue",
      parenthetical: "pm-parenthetical",
      transition: "pm-transition",
    };
    return map[type] ?? "";
  });
}

// ─── Suite setup ──────────────────────────────────────────────────────────────

test.describe("Screenplay Authoring [E2E user story]", () => {
  test.beforeAll(async ({ browser }) => {
    // 1. Sign in as the seeded test user
    authCookies = await signInViaApi(TEST_EMAIL, TEST_PASSWORD);

    // 2. Create a fresh project "Short Film E2E" owned by the test user
    const page = await openAuthenticatedPage(browser);
    await page.goto(`${BASE_URL}/projects/new`);

    // Wait for React to hydrate before interacting with the controlled form
    await page.waitForLoadState("networkidle");
    const titleInput = page.getByRole("textbox", { name: /title/i });
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    // Use fill() which fires the full input event chain React needs
    await titleInput.fill("Short Film E2E");
    await expect(titleInput).toHaveValue("Short Film E2E");
    // Format select — pick "short"
    const formatSelect = page.getByRole("combobox", { name: /format/i });
    await formatSelect.selectOption("short");
    await page.getByRole("button", { name: /create project/i }).click();

    // Wait for redirect to the project page (UUID in URL, not "new")
    await page.waitForURL(
      (url) => /\/projects\/[0-9a-f-]{36}$/.test(url.pathname),
      { timeout: 15_000 },
    );
    const url = page.url();
    const match = url.match(/\/projects\/([0-9a-f-]{36})$/);
    if (!match?.[1])
      throw new Error(`Could not extract project ID from: ${url}`);
    projectId = match[1];

    await page.context().close();
  });

  // ─── Helper that needs projectId (set in beforeAll) ───────────────────────

  async function goToScreenplay(page: Page) {
    await page.goto(`${BASE_URL}/projects/${projectId}/screenplay`);
    return waitForEditor(page);
  }

  // ─── OHW-S01 — Editor loads empty for a new project ──────────────────────

  test("[OHW-S01] editor loads empty for a new project", async ({
    browser,
  }) => {
    const page = await openAuthenticatedPage(browser);
    await goToScreenplay(page);

    const fountain = await getFountain(page);
    // New project — the doc has one empty action block which serialises to a
    // blank line (or the empty-doc sentinel). Content is minimal.
    expect(fountain.trim().length).toBeLessThan(50);

    await page.context().close();
  });

  // ─── OHW-S02 — Write Scene 1: INT. CUCINA - NOTTE ────────────────────────
  //
  // Scene 1 tests: heading prefix+title, action, two characters with dialogue

  test("[OHW-S02] write Scene 1 — INT. CUCINA - NOTTE with dialogue", async ({
    browser,
  }) => {
    const page = await openAuthenticatedPage(browser);
    await goToScreenplay(page);

    // ── Scene heading ──────────────────────────────────────────────────────
    // Ensure cursor is in an action block before Alt+s — the initial doc for
    // a new project has only an empty heading (no action), so a click in the
    // editor could land in prefix/title (where Alt+s is a no-op). goToNewLine
    // inserts an empty action as the last body block, giving Alt+s a valid target.
    await goToNewLine(page);
    await page.keyboard.press("Alt+s");
    await page.waitForTimeout(150);
    expect(await focusedPmClass(page)).toContain("pm-heading-prefix");

    // Type prefix then Space to hop to title (Space in prefix = navigation)
    await page.keyboard.type("INT.");
    await page.keyboard.press("Space");
    await page.waitForTimeout(80);
    expect(await focusedPmClass(page)).toContain("pm-heading-title");

    await page.keyboard.type("CUCINA - NOTTE");

    // Verify the heading DOM — the new heading is the last one in the doc
    // (goToNewLine + Alt+s prepends an extra empty scene before it).
    const prefix0 = await page
      .locator(".pm-heading-prefix")
      .last()
      .textContent();
    const title0 = await page.locator(".pm-heading-title").last().textContent();
    expect(prefix0?.trim()).toBe("INT.");
    expect(title0?.trim()).toBe("CUCINA - NOTTE");

    // Enter from title → new action block
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
    expect(await focusedPmClass(page)).toContain("pm-action");

    // ── Action ─────────────────────────────────────────────────────────────
    await typeAndSettle(
      page,
      "Giuseppe sta lavando i piatti. Maria entra, stanca.",
    );
    await page.keyboard.press("Enter");

    // ── GIUSEPPE ───────────────────────────────────────────────────────────
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(80);
    expect(await focusedPmClass(page)).toContain("pm-character");

    // Typo: type "Giseppe" then backspace-correct to "GIUSEPPE"
    await page.keyboard.type("Giseppe");
    for (let i = 0; i < 7; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("GIUSEPPE");
    await page.keyboard.press("Escape"); // dismiss autocomplete if open

    await page.keyboard.press("Enter"); // → dialogue
    await page.waitForTimeout(80);
    expect(await focusedPmClass(page)).toContain("pm-dialogue");

    await typeAndSettle(
      page,
      "Ho gia lavato tutto io. Puoi mettere Josue a letto tu?",
    );

    // Double-Enter out of dialogue → action
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    // ── Action ─────────────────────────────────────────────────────────────
    await typeAndSettle(page, "Maria lo guarda, incredula.");
    await page.keyboard.press("Enter");

    // ── MARIA ──────────────────────────────────────────────────────────────
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(80);
    await page.keyboard.type("MARIA");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Enter"); // → dialogue
    await typeAndSettle(page, "Anch'io ho lavorato tutto il giorno.");

    // Double-Enter → action
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    // ── Closing action ─────────────────────────────────────────────────────
    await typeAndSettle(
      page,
      "Giuseppe sbuffa, si asciuga le mani e scompare nel corridoio.",
    );

    // ── Verify Fountain content ────────────────────────────────────────────
    await page.waitForTimeout(300);
    const fountain = await getFountain(page);
    expect(fountain).toContain("INT. CUCINA - NOTTE");
    expect(fountain).toContain("Giuseppe sta lavando");
    expect(fountain).toContain("GIUSEPPE");
    expect(fountain).toContain("Ho gia lavato");
    expect(fountain).toContain("MARIA");
    expect(fountain).toContain("Maria lo guarda, incredula.");

    // Force-save so S03 and later tests load this content from DB.
    await forceSave(page);
    await page.context().close();
  });

  // ─── OHW-S03 — Write Scene 2: INT. CAMERA - NOTTE with parenthetical ─────

  test("[OHW-S03] write Scene 2 — INT. CAMERA - NOTTE with parenthetical", async ({
    browser,
  }) => {
    const page = await openAuthenticatedPage(browser);
    await goToScreenplay(page);

    await goToNewLine(page);

    // Type heading text as action, then convert to scene via Alt+s.
    // setElement("scene") moves the block text into the heading title and
    // places the cursor in the empty prefix — no backspace dance needed.
    await typeAndSettle(page, "CAMERA - NOTTE");
    await page.keyboard.press("Alt+s");
    await page.waitForTimeout(150);
    expect(await focusedPmClass(page)).toContain("pm-heading-prefix");

    // Prefix is empty — type it, then Space hops to title (which already
    // contains "CAMERA - NOTTE" from the converted action block).
    await page.keyboard.type("INT.");
    await page.keyboard.press("Space");
    await page.waitForTimeout(80);
    expect(await focusedPmClass(page)).toContain("pm-heading-title");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);

    // Action
    await typeAndSettle(
      page,
      "Buio. Giuseppe e Maria a letto, schiena contro schiena. Silenzio.",
    );
    await page.keyboard.press("Enter");

    // MARIA — with parenthetical
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(80);
    await page.keyboard.type("MARIA");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter"); // → dialogue

    // Alt+p from dialogue → parenthetical
    await page.keyboard.press("Alt+p");
    await page.waitForTimeout(80);
    expect(await focusedPmClass(page)).toContain("pm-parenthetical");

    // Clear the default "()" placeholder text and type the direction
    await page.keyboard.press("Control+a");
    await typeAndSettle(page, "(sottovoce)");

    // Enter from parenthetical → dialogue
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
    expect(await focusedPmClass(page)).toContain("pm-dialogue");

    await typeAndSettle(page, "Mi dispiace.");

    // Double-Enter → action
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    // GIUSEPPE — short reply, no parenthetical
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(80);
    await page.keyboard.type("GIUSEPPE");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await typeAndSettle(page, "Anch'io.");

    // Double-Enter → action
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    // Closing action
    await typeAndSettle(
      page,
      "Ridono piano. Si avvicinano. La luce si spegne.",
    );

    // Verify
    await page.waitForTimeout(300);
    const fountain = await getFountain(page);
    expect(fountain).toContain("INT. CAMERA - NOTTE");
    expect(fountain).toContain("(sottovoce)");
    expect(fountain).toContain("Mi dispiace.");
    expect(fountain).toContain("Ridono piano.");

    // Force-save so S04 loads this content (including "INT." prefix vocabulary).
    await forceSave(page);
    await page.context().close();
  });

  // ─── OHW-S04 — Write Scene 3: INT. CUCINA - MATTINO with autocomplete ────

  test("[OHW-S04] write Scene 3 — INT. CUCINA - MATTINO, verify autocomplete", async ({
    browser,
  }) => {
    const page = await openAuthenticatedPage(browser);
    await goToScreenplay(page);

    await goToNewLine(page);
    await page.keyboard.press("Alt+s");
    await page.waitForTimeout(100);
    if ((await focusedPmClass(page)).includes("pm-heading-title")) {
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(80);
    }
    expect(await focusedPmClass(page)).toContain("pm-heading-prefix");

    // Prefix picker: type "I" → picker suggests "INT."
    await page.keyboard.type("I");
    await page.waitForTimeout(200);

    const prefixPicker = page.locator('ul[data-picker-slot="prefix"]');
    await expect(prefixPicker).toBeVisible({ timeout: 3_000 });
    const pickerItems = await prefixPicker.locator("li").allTextContents();
    expect(pickerItems.some((t) => t.includes("INT."))).toBe(true);

    // Select INT. from picker with Enter
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
    // Cursor should have hopped to title after picker selection
    expect(await focusedPmClass(page)).toContain("pm-heading-title");

    // Type title directly (dismiss any title picker that might appear)
    await page.keyboard.type("CUCINA - MATTINO");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);

    // ── Action ─────────────────────────────────────────────────────────────
    await typeAndSettle(
      page,
      "Colazione. Josue mangia i cereali. Giuseppe e Maria si versano il caffe.",
    );
    await page.keyboard.press("Enter");

    // ── GIUSEPPE — character autocomplete ──────────────────────────────────
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(80);

    // Type "G" → autocomplete should suggest GIUSEPPE
    await page.keyboard.type("G");

    const charDropdown = page.locator(
      'ul[role="listbox"]:not([data-picker-slot])',
    );
    await expect(charDropdown).toBeVisible({ timeout: 5_000 });
    const charItems = await charDropdown.locator("li").allTextContents();
    expect(charItems.some((t) => t.includes("GIUSEPPE"))).toBe(true);

    // Select GIUSEPPE via Enter
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);

    await page.keyboard.press("Enter"); // → dialogue
    await typeAndSettle(page, "Oggi lo porti tu a scuola.");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter"); // → action

    // ── MARIA ──────────────────────────────────────────────────────────────
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(80);
    await page.keyboard.type("MARIA");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await typeAndSettle(page, "Io? Oggi ho la riunione alle otto.");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    // ── Action ─────────────────────────────────────────────────────────────
    await typeAndSettle(page, "Josue alza la mano.");
    await page.keyboard.press("Enter");

    // ── JOSUE ──────────────────────────────────────────────────────────────
    await page.keyboard.press("Alt+c");
    await page.waitForTimeout(80);
    await page.keyboard.type("JOSUE");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await typeAndSettle(page, "Vado col bus.");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    // ── Extra action to push content past the first page boundary ─────────
    await typeAndSettle(
      page,
      "Maria sorride. Prende la tazza e la porta alle labbra lentamente.",
    );
    await page.keyboard.press("Enter");
    await typeAndSettle(
      page,
      "Giuseppe la osserva senza parlare. Il silenzio si allunga.",
    );
    await page.keyboard.press("Enter");
    await typeAndSettle(
      page,
      "Josue smette di mangiare e guarda prima uno poi l'altra.",
    );
    await page.keyboard.press("Enter");
    await typeAndSettle(
      page,
      "Il rumore dei cucchiai nel silenzio. Nessuno parla.",
    );
    await page.keyboard.press("Enter");
    await typeAndSettle(
      page,
      "Maria appoggia la tazza. Si alza. Porta il piatto al lavello.",
    );
    await page.keyboard.press("Enter");
    await typeAndSettle(
      page,
      "Giuseppe aspetta. Josue alza le spalle e riprende a mangiare.",
    );
    await page.keyboard.press("Enter");

    // ── Transition: FINE. ──────────────────────────────────────────────────
    await page.keyboard.press("Alt+t");
    await page.waitForTimeout(80);
    expect(await focusedPmClass(page)).toContain("pm-transition");
    await typeAndSettle(page, "FINE.");

    // ── Final Fountain check ───────────────────────────────────────────────
    await page.waitForTimeout(300);
    const fountain = await getFountain(page);

    expect(fountain).toContain("INT. CUCINA - MATTINO");
    expect(fountain).toContain("Colazione.");
    expect(fountain).toContain("GIUSEPPE");
    expect(fountain).toContain("Oggi lo porti tu");
    expect(fountain).toContain("MARIA");
    expect(fountain).toContain("Io? Oggi ho la riunione");
    expect(fountain).toContain("JOSUE");
    expect(fountain).toContain("Vado col bus.");
    expect(fountain).toContain("FINE.");

    // ── Page break marker ──────────────────────────────────────────────────
    // The paginator plugin inserts a .pm-page-break widget decoration once
    // the rendered content exceeds one printable page (960px). After three
    // scenes with full dialogue there should be at least one break.
    await page.waitForTimeout(500);
    const pageBreaks = await page.locator(".pm-page-break").count();
    expect(pageBreaks).toBeGreaterThan(0);

    // Force-save so S05 loads this content when verifying the round-trip.
    await forceSave(page);
    await page.context().close();
  });

  // ─── OHW-S05 — Full Fountain round-trip: all 3 scenes present ────────────

  test("[OHW-S05] full Fountain round-trip — all 3 scenes present", async ({
    browser,
  }) => {
    const page = await openAuthenticatedPage(browser);
    await goToScreenplay(page);

    await page.waitForTimeout(500); // let initial docToFountain run
    const fountain = await getFountain(page);

    // All three scene headings
    expect(fountain).toContain("INT. CUCINA - NOTTE");
    expect(fountain).toContain("INT. CAMERA - NOTTE");
    expect(fountain).toContain("INT. CUCINA - MATTINO");

    // Characters
    expect(fountain).toContain("GIUSEPPE");
    expect(fountain).toContain("MARIA");
    expect(fountain).toContain("JOSUE");

    // Parenthetical
    expect(fountain).toContain("(sottovoce)");

    // Transition
    expect(fountain).toContain("FINE.");

    // Structural sanity: heading lines must appear before their scene content
    const lines = fountain.split("\n");
    const cucina1 = lines.findIndex((l) => l.trim() === "INT. CUCINA - NOTTE");
    const camera = lines.findIndex((l) => l.trim() === "INT. CAMERA - NOTTE");
    const cucina2 = lines.findIndex(
      (l) => l.trim() === "INT. CUCINA - MATTINO",
    );
    expect(cucina1).toBeGreaterThanOrEqual(0);
    expect(camera).toBeGreaterThan(cucina1);
    expect(cucina2).toBeGreaterThan(camera);

    await page.context().close();
  });

  // ─── OHW-S06 — Scene heading rendering: prefix ≠ title in DOM ────────────

  test("[OHW-S06] heading renders prefix and title as separate spans", async ({
    browser,
  }) => {
    const page = await openAuthenticatedPage(browser);
    await goToScreenplay(page);
    await page.waitForTimeout(300);

    const headings = page.locator("h2.pm-heading");
    const count = await headings.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Every heading must have both child spans
    const prefixes = page.locator(".pm-heading-prefix");
    const titles = page.locator(".pm-heading-title");
    expect(await prefixes.count()).toBe(count);
    expect(await titles.count()).toBe(count);

    // Find the heading whose title is "CUCINA - NOTTE" — the first authored
    // heading from S02. We filter by content rather than by positional index
    // because the number of synthetic empty headings inserted before it is
    // an implementation detail.
    const cucinaHeading = page
      .locator("h2.pm-heading")
      .filter({
        has: page.locator(".pm-heading-title", { hasText: "CUCINA - NOTTE" }),
      })
      .first();
    const firstPrefix = await cucinaHeading
      .locator(".pm-heading-prefix")
      .textContent();
    const firstTitle = await cucinaHeading
      .locator(".pm-heading-title")
      .textContent();
    expect(firstPrefix?.trim()).toBe("INT.");
    expect(firstTitle?.trim()).toBe("CUCINA - NOTTE");

    // The visual separator between prefix and title — a " " space injected by
    // the CSS ::before rule on .pm-heading-title. We verify the computed style
    // has content: " ".
    const beforeContent = await cucinaHeading
      .locator(".pm-heading-title")
      .evaluate((el) => {
        return getComputedStyle(el, "::before").content;
      });
    // Browsers return the content value as a quoted string: '" "'
    expect(beforeContent).toMatch(/"\s+"/);

    await page.context().close();
  });
});
