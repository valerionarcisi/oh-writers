/**
 * Renders a Fountain string into a PDF buffer.
 *
 * For Spec 05k we route every export through `awc-runner.cjs` (a thin
 * wrapper around afterwriting's `awc.js` that supports nested print-profile
 * overrides). The runner accepts the same CLI flags as `awc.js` plus
 * `OHW_PROFILE_OVERRIDES` via env var.
 *
 * Input/output flow through tmp files because the CLI is file-oriented.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { AwcInvocation } from "./export-pipeline";

const execFileAsync = promisify(execFile);

const RUNNER_PATH = fileURLToPath(new URL("./awc-runner.cjs", import.meta.url));

export interface BuildPdfOptions {
  readonly invocation?: AwcInvocation;
}

export const buildScreenplayPdf = async (
  fountain: string,
  options: BuildPdfOptions = {},
): Promise<Buffer> => {
  const dir = await mkdtemp(path.join(tmpdir(), "ohw-screenplay-"));
  const sourcePath = path.join(dir, "in.fountain");
  const pdfPath = path.join(dir, "out.pdf");

  const cliSettings = options.invocation?.cliSettings ?? [];
  const profileOverrides = options.invocation?.profileOverrides ?? {};

  const args: string[] = [
    RUNNER_PATH,
    "--source",
    sourcePath,
    "--pdf",
    pdfPath,
    "--overwrite",
  ];
  for (const setting of cliSettings) {
    args.push("--setting", setting);
  }

  try {
    await writeFile(sourcePath, fountain, "utf8");
    await execFileAsync(process.execPath, args, {
      env: {
        ...process.env,
        OHW_PROFILE_OVERRIDES: JSON.stringify(profileOverrides),
      },
    });
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

/**
 * `{project}-{screenplay}[-{format}]-{YYYY-MM-DD}.pdf`. The format slug is
 * omitted when empty (i.e. for the standard format), keeping backwards
 * compat with previously generated filenames.
 */
export const buildScreenplayFilename = (
  projectTitle: string,
  screenplayTitle: string,
  formatSlug = "",
): string => {
  const project = slugify(projectTitle);
  const screenplay = slugify(screenplayTitle);
  const middle = formatSlug.length > 0 ? `-${formatSlug}` : "";
  return `${project}-${screenplay}${middle}-${todayIso()}.pdf`;
};
