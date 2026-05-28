// scripts/_mockup-audit.mjs
// Capture screenshots of every drawer/shell state in the spec-44 mockup.
// Output: docs/specs/mockups/audit/*.png

import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const MOCKUP = resolve(ROOT, "docs/specs/mockups/shell-canva-notion.html");
const OUT_DIR = resolve(ROOT, "docs/specs/mockups/audit");

await mkdir(OUT_DIR, { recursive: true });

const STATES = [
  // [filename, body datasets, optional pre-screenshot JS]
  ["01-closed.png", { cesare: "closed", mode: "float", shell: "expanded", view: "breakdown" }],
  ["02-expanded.png", { cesare: "expanded", mode: "float", shell: "expanded", view: "breakdown" }],
  ["03-expanded-split.png", { cesare: "expanded-split", mode: "float", shell: "expanded", view: "breakdown" }],
  ["04-peek.png", { cesare: "peek", mode: "float", shell: "expanded", view: "breakdown" }],
  ["05-full.png", { cesare: "full", mode: "float", shell: "expanded", view: "breakdown" }],
  ["06-shell-collapsed.png", { cesare: "closed", mode: "float", shell: "collapsed", view: "breakdown" }],
  ["07-shell-collapsed-hover.png", { cesare: "closed", mode: "float", shell: "collapsed", view: "breakdown" }, "document.body.setAttribute('data-rail-reveal','open')"],
  ["08-shell-focus.png", { cesare: "closed", mode: "float", shell: "focus", view: "breakdown" }],
  ["09-screenplay-expanded.png", { cesare: "expanded", mode: "float", shell: "expanded", view: "screenplay" }],
  ["10-soggetto-expanded.png", { cesare: "expanded", mode: "float", shell: "expanded", view: "soggetto" }],
  ["11-locations-expanded-split.png", { cesare: "expanded-split", mode: "float", shell: "expanded", view: "locations" }],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto("file://" + MOCKUP);
await page.waitForLoadState("networkidle");

for (const [filename, dataset, pre] of STATES) {
  // First, reset to a neutral state so animations re-trigger cleanly.
  await page.evaluate(() => {
    document.body.dataset.cesare = "closed";
    document.body.removeAttribute("data-rail-reveal");
  });
  await page.waitForTimeout(100);
  await page.evaluate((d) => {
    for (const [k, v] of Object.entries(d)) {
      document.body.dataset[k] = v;
    }
    document.body.removeAttribute("data-rail-reveal");
    // Trigger view + cesare + mode + shell setup so the demo helpers stay in sync.
    if (typeof setView === "function") setView(d.view);
    if (typeof setMode === "function") setMode(d.mode);
    if (typeof setCesare === "function") setCesare(d.cesare);
    if (typeof setShell === "function") setShell(d.shell);
  }, dataset);
  if (pre) {
    await page.evaluate(pre);
  }
  // Wait for animations to settle (250ms duration + buffer).
  await page.waitForTimeout(450);
  const out = resolve(OUT_DIR, filename);
  await page.screenshot({ path: out, fullPage: false });
  console.log("[screenshot]", filename);
}

await browser.close();
console.log("[done] wrote to", OUT_DIR);
