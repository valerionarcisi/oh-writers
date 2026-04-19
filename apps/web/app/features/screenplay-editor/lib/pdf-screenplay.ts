/**
 * Renders a Fountain string into a PDF buffer using the afterwriting CLI.
 *
 * afterwriting is an AMD-bundled library that's painful to require directly
 * from a Node ESM context, so we shell out to its CLI binary the same way
 * `scripts/generate-test-pdfs.ts` does. Input/output flow through tmp files
 * because the CLI is file-oriented; both are unlinked on completion.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const execFileAsync = promisify(execFile);

const requireFromHere = createRequire(import.meta.url);

export const buildScreenplayPdf = async (fountain: string): Promise<Buffer> => {
  const bin = requireFromHere.resolve("afterwriting/awc.js");
  const dir = await mkdtemp(path.join(tmpdir(), "ohw-screenplay-"));
  const sourcePath = path.join(dir, "in.fountain");
  const pdfPath = path.join(dir, "out.pdf");

  try {
    await writeFile(sourcePath, fountain, "utf8");
    await execFileAsync(process.execPath, [
      bin,
      "--source",
      sourcePath,
      "--pdf",
      pdfPath,
      "--overwrite",
    ]);
    return await readFile(pdfPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";

const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const buildScreenplayFilename = (
  projectTitle: string,
  screenplayTitle: string,
): string =>
  `${slugify(projectTitle)}-${slugify(screenplayTitle)}-${todayIso()}.pdf`;
