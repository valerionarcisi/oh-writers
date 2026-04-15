/**
 * Generate PDF test fixtures from .fountain sources.
 *
 * Reads every `*.fountain` in `tests/fixtures/screenplays/` and writes a
 * matching `*.pdf` next to it, using the afterwriting CLI.
 *
 * Run from repo root:   pnpm test:fixtures:pdf
 *
 * afterwriting is the same library that will power the user-facing PDF
 * export feature (Spec 08). Keeping test fixture generation on the same
 * renderer guarantees what we test matches what users will get.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AFTERWRITING_BIN = require.resolve("afterwriting/awc.js");

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURES_DIR = path.join(REPO_ROOT, "tests", "fixtures", "screenplays");

const fountainFiles = readdirSync(FIXTURES_DIR)
  .filter((name) => name.endsWith(".fountain"))
  .map((name) => path.join(FIXTURES_DIR, name));

if (fountainFiles.length === 0) {
  process.stdout.write(`No .fountain files found in ${FIXTURES_DIR}\n`);
  process.exit(0);
}

for (const source of fountainFiles) {
  const pdf = source.replace(/\.fountain$/, ".pdf");
  const shouldRegenerate =
    !existsSync(pdf) || statSync(source).mtimeMs > statSync(pdf).mtimeMs;

  if (!shouldRegenerate) {
    process.stdout.write(`✓ up-to-date: ${path.basename(pdf)}\n`);
    continue;
  }

  process.stdout.write(`→ generating: ${path.basename(pdf)}\n`);
  execFileSync(
    process.execPath,
    [AFTERWRITING_BIN, "--source", source, "--pdf", pdf, "--overwrite"],
    { stdio: "inherit" },
  );
}

function existsSync(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}
