// apps/web/app/quality/ds-consistency.test.ts
//
// [OHW-056] Design-system consistency guard (Spec 56, Phase 2 — static analysis).
//
// Two source-scan rules that keep the UI coherent at the SOURCE, so drift can't
// accumulate unnoticed:
//
//  1. No inline locale/plan/market gating in feature/route code — every show/hide
//     decision must go through resolveFeatures/useFeature (CLAUDE.md hard rule +
//     Spec 54). Currently clean (0) → enforced STRICTLY.
//  2. No rogue hex colours in CSS modules — colours come from `--ds-*` tokens.
//     The codebase still carries legacy hex, so this is a RATCHET: the count may
//     only go down. Adding a new raw hex fails the build; burn the baseline down
//     over time. Hex used as a `var(--token, #fallback)` fallback is allowed.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "../..");
const SCAN_DIRS = [join(ROOT, "apps/web/app"), join(ROOT, "packages/ui/src")];

// Ratchet baseline — the count of legacy rogue hex at the time this guard was
// added (2026-06-03). MAY ONLY DECREASE. Lower it as colours are tokenised.
const ROGUE_HEX_BASELINE = 43;

const walk = (dir: string, ext: RegExp): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (!entry.isFile()) continue;
    if (!ext.test(entry.name)) continue;
    out.push(join(entry.parentPath, entry.name));
  }
  return out;
};

const stripVarFallback = (line: string): string =>
  // remove `var(--token, #abc)` fallbacks so only truly raw hex remains
  line.replace(/var\(\s*--[a-z0-9-]+\s*,\s*#[0-9a-fA-F]{3,8}\s*\)/g, "var()");

describe("[OHW-056] DS consistency", () => {
  it("has no inline locale/plan/market gating in feature/route code", () => {
    const files = SCAN_DIRS.flatMap((d) => walk(d, /\.tsx?$/)).filter(
      (f) =>
        !/\.(test|spec)\.tsx?$/.test(f) &&
        !/resolve-locale|\/i18n\/|features\/i18n|flags\.ts|resolve-features/.test(
          f,
        ),
    );
    const gate =
      /\b(locale|market|plan)\s*===\s*["'](en|it|intl|free|pro|studio|[a-z-]+)["']/;
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      text.split("\n").forEach((line, i) => {
        if (gate.test(line))
          offenders.push(
            `${f.replace(ROOT + "/", "")}:${i + 1}  ${line.trim()}`,
          );
      });
    }
    expect(
      offenders,
      `Inline locale/plan/market gating found — route through useFeature/resolveFeatures (Spec 54):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("does not add rogue hex colours beyond the ratchet baseline", () => {
    const files = SCAN_DIRS.flatMap((d) => walk(d, /\.module\.css$/));
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      text.split("\n").forEach((line, i) => {
        const cleaned = stripVarFallback(line);
        if (/url\(/.test(cleaned)) return;
        if (/#[0-9a-fA-F]{3,8}\b/.test(cleaned))
          offenders.push(`${f.replace(ROOT + "/", "")}:${i + 1}`);
      });
    }
    expect(
      offenders.length,
      `Rogue hex count rose above the ratchet baseline (${ROGUE_HEX_BASELINE}). ` +
        `Use --ds-* tokens. If you tokenised some, LOWER the baseline.\nCurrent offenders:\n${offenders.join("\n")}`,
    ).toBeLessThanOrEqual(ROGUE_HEX_BASELINE);
  });
});
