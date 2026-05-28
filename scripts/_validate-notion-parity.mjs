// scripts/_validate-notion-parity.mjs
//
// Spec 44 WP-QA — Notion + mockup parity validation.
//
// We capture screenshots of every Cesare/shell state from BOTH visual sources
// of truth:
//   - the static HTML mockup `docs/specs/mockups/shell-canva-notion.html`
//   - the live local app at http://localhost:3000 (cookie-authenticated)
//
// Outputs to `docs/specs/mockups/audit/notion-parity/` plus a Markdown delta
// note (NOTION-PARITY.md) summarising the parity audit.
//
// chrome-agent is used as an optional helper to capture Notion live — it's
// invoked when present at /Users/valerionarcisi/.cargo/bin/chrome-agent so
// the script remains runnable without it. Notion comparison shots are
// stored alongside but are NOT required for the parity gate to pass.
//
// Usage:
//   pnpm exec node scripts/_validate-notion-parity.mjs
//
// Flags:
//   --skip-live     Skip the live-app capture (use when no dev server is up)
//   --skip-notion   Skip the chrome-agent Notion capture

import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir, writeFile, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const MOCKUP = resolve(ROOT, "docs/specs/mockups/shell-canva-notion.html");
const OUT_DIR = resolve(ROOT, "docs/specs/mockups/audit/notion-parity");
const CHROME_AGENT = "/Users/valerionarcisi/.cargo/bin/chrome-agent";

const argv = new Set(process.argv.slice(2));
const SKIP_LIVE = argv.has("--skip-live");
const SKIP_NOTION = argv.has("--skip-notion");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TEAM_PROJECT_ID = "00000000-0000-4000-a000-000000000011";

await mkdir(OUT_DIR, { recursive: true });

// ─── State matrix shared by both sources ─────────────────────────────────
// Each entry maps a parity-grid slot to a body[data-*] attribute set.
const STATES = [
  {
    id: "cesare-closed-shell-full",
    description: "Cesare closed · shell full (BottomDock visible)",
    body: { cesare: "closed", shell: "full", view: "breakdown" },
  },
  {
    id: "cesare-expanded-shell-full",
    description: "Cesare expanded · shell full (drawer bottom-right)",
    body: { cesare: "expanded", shell: "full", view: "breakdown" },
  },
  {
    id: "cesare-peek-shell-full",
    description: "Cesare peek · shell full (peek bar bottom-right)",
    body: { cesare: "peek", shell: "full", view: "breakdown" },
  },
  {
    id: "cesare-full-shell-hidden",
    description: "Cesare full-page (rail/topstrip/dock hidden)",
    body: { cesare: "full", shell: "full", view: "breakdown" },
  },
  {
    id: "cesare-closed-shell-collapsed",
    description: "Shell collapsed (rail hidden, hamburger visible)",
    body: { cesare: "closed", shell: "collapsed", view: "breakdown" },
  },
  {
    id: "cesare-closed-shell-focus",
    description: "Shell focus (everything hidden)",
    body: { cesare: "closed", shell: "focus", view: "breakdown" },
  },
];

/**
 * Captures the static-mockup screenshots — these are the SPEC reference.
 */
async function captureMockup() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto("file://" + MOCKUP);
  await page.waitForLoadState("networkidle");

  for (const state of STATES) {
    await page.evaluate(() => {
      document.body.dataset.cesare = "closed";
      document.body.dataset.shell = "full";
    });
    await page.evaluate((body) => {
      for (const [k, v] of Object.entries(body)) {
        document.body.dataset[k] = v;
      }
    }, state.body);
    await page.waitForTimeout(150);
    const target = resolve(OUT_DIR, `mockup-${state.id}.png`);
    await page.screenshot({ path: target, fullPage: false });
    console.log(`✓ mockup ${state.id}`);
  }

  await browser.close();
}

/**
 * Captures the live-app screenshots from a logged-in session on the dev
 * server. Cookie-based auth so the script can run head-less in CI.
 */
async function captureLiveApp() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // Sign in via API to skip the UI form
  const signin = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({
      email: "test@ohwriters.dev",
      password: "testpassword123",
    }),
  });
  if (!signin.ok) {
    console.warn(`! live-app sign-in failed (${signin.status}) — skipping live captures`);
    await browser.close();
    return false;
  }
  const setCookies = signin.headers.getSetCookie();
  const cookies = setCookies
    .map((header) => {
      const [nv] = header.split(";");
      if (!nv) return null;
      const eq = nv.indexOf("=");
      if (eq === -1) return null;
      return {
        name: nv.substring(0, eq),
        value: nv.substring(eq + 1),
        domain: "localhost",
        path: "/",
      };
    })
    .filter(Boolean);
  if (cookies.length > 0) await ctx.addCookies(cookies);

  await page.goto(`${BASE_URL}/projects/${TEAM_PROJECT_ID}/breakdown`);
  await page.waitForLoadState("networkidle", { timeout: 30_000 });

  for (const state of STATES) {
    await page.evaluate((body) => {
      for (const [k, v] of Object.entries(body)) {
        document.body.setAttribute(`data-${k}`, v);
      }
    }, state.body);
    await page.waitForTimeout(250);
    const target = resolve(OUT_DIR, `liveapp-${state.id}.png`);
    await page.screenshot({ path: target, fullPage: false });
    console.log(`✓ liveapp ${state.id}`);
  }

  await browser.close();
  return true;
}

/**
 * Captures Notion live screenshots via chrome-agent if it's available AND
 * the agent is already pointed at a Notion-like page. We don't perform a
 * Notion login here — the brief notes the user must have an existing
 * session. We just take screenshots of whatever Notion page is open.
 */
async function captureNotion() {
  try {
    await access(CHROME_AGENT);
  } catch {
    console.warn(`! chrome-agent not found at ${CHROME_AGENT} — skipping Notion captures`);
    return false;
  }
  try {
    // Take a single snapshot of whatever Chrome page is currently open as
    // a "live Notion reference". The user should have Notion focused.
    const target = resolve(OUT_DIR, `notion-current-page.png`);
    await execFileP(CHROME_AGENT, ["screenshot", "--filename", target], {
      timeout: 30_000,
    });
    console.log(`✓ notion ${target}`);
    return true;
  } catch (err) {
    console.warn(`! chrome-agent screenshot failed: ${err.message}`);
    return false;
  }
}

/**
 * Writes a Markdown summary tying each captured pair together with delta
 * notes. This file is the contract WP-LEAD reads when deciding to dispatch
 * respawns.
 */
async function writeReport({ liveCaptured, notionCaptured }) {
  const lines = [
    "# Notion + Mockup Parity Audit",
    "",
    "Spec 44 WP-QA — automated parity grid between three visual references:",
    "",
    "1. `docs/specs/mockups/shell-canva-notion.html` (REFERENCE #1 — visual style)",
    "2. Live Notion AI chat (REFERENCE #2 — interaction pattern; via chrome-agent)",
    "3. Live local app at http://localhost:3000",
    "",
    `- live-app captures: ${liveCaptured ? "OK" : "SKIPPED (dev server unreachable)"}`,
    `- notion screen capture: ${notionCaptured ? "OK" : "SKIPPED (chrome-agent unavailable)"}`,
    "",
    "## State matrix",
    "",
    "| State | Mockup | Live app | Notes |",
    "| ----- | ------ | -------- | ----- |",
  ];
  for (const state of STATES) {
    const mockup = `mockup-${state.id}.png`;
    const live = liveCaptured ? `liveapp-${state.id}.png` : "n/a";
    lines.push(`| ${state.description} | ${mockup} | ${live} | — |`);
  }
  lines.push("");
  lines.push("## Delta notes");
  lines.push("");
  lines.push(
    "Compare the rendered PNGs visually. Flag a divergence as a respawn ticket in",
    "`docs/specs/44-respawn-tickets.md` when:",
    "",
    "- the editor pixel-shifts on a Cesare transition (closed → expanded → peek → full → closed)",
    "- the shell collapsed mode reflows the main content rather than overlaying the rail",
    "- the Cesare full-page does NOT narrow when SplitDrawer opens in trace mode",
    "- the BottomDock stays visible when Cesare ≠ closed",
    "- the bell from BottomDock and the bell inside the Cesare header mount different drawers",
    "",
    "Each ticket must contain: failed assertion, responsible WP agent name, failing file path, corrected expectation.",
  );

  await writeFile(resolve(OUT_DIR, "NOTION-PARITY.md"), lines.join("\n"), "utf-8");
  console.log(`✓ wrote NOTION-PARITY.md`);
}

// ─── Main ────────────────────────────────────────────────────────────────
console.log("Spec 44 — Notion + mockup parity validation");
console.log("------------------------------------------------------");

await captureMockup();
const liveCaptured = SKIP_LIVE ? false : await captureLiveApp();
const notionCaptured = SKIP_NOTION ? false : await captureNotion();
await writeReport({ liveCaptured, notionCaptured });

console.log("------------------------------------------------------");
console.log("Done. Output:", OUT_DIR);
