/**
 * Vernissage walk — drives a scripted browser session via playwright-cli
 * against a running dev/test server, captures screenshots + a structured log,
 * and exits non-zero on any step failure.
 *
 * Run examples:
 *   pnpm vernissage:walk -- --story=vernissage/_stories/foo.story.json
 *   pnpm exec tsx scripts/vernissage-walk.ts --story=… --target=dev
 *   pnpm exec tsx scripts/vernissage-walk.ts --story=… --base-url=http://localhost:4001
 *
 * The script does NOT start a server. The caller must have `pnpm dev` (port
 * 3000) or `pnpm test` server (port 3002) up — pass --target to choose.
 *
 * Artifacts land in `vernissage/<story.id>/`:
 *   screenshots/  (one PNG per `screenshot` step)
 *   log.json      (always)
 *   failures.json (only if at least one step failed)
 *
 * The orchestrator agent fills `report.md` from those raw artifacts using
 * `vernissage/_template.md`. This script never writes report.md.
 */
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadJson,
  parseArgs,
  validateStory,
  type Step,
  type Story,
} from "./vernissage/lib.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const ALLOWED_FLAGS = [
  "story",
  "base-url",
  "target",
  "out",
  "session",
  "help",
] as const;

const HELP = `vernissage-walk — scripted browser walk for vernissage stories

Usage:
  pnpm vernissage:walk -- --story=<path> [--target=dev|test] [--base-url=<url>]
                          [--out=<dir>] [--session=<name>]

Flags:
  --story=<path>       Path to a *.story.json file (required).
  --target=dev|test    dev (default) → http://localhost:3000
                       test          → http://localhost:3002
  --base-url=<url>     Override the target URL (wins over --target).
  --out=<dir>          Output directory (default: vernissage/<story.id>/).
  --session=<name>     playwright-cli session name (default: vernissage).
  --help               Show this message.

Outputs:
  <out>/screenshots/   PNGs from screenshot steps
  <out>/log.json       Structured per-step log
  <out>/failures.json  Only present when one or more steps failed
`;

interface StepResult {
  index: number;
  kind: Step["kind"];
  ok: boolean;
  duration_ms: number;
  detail?: string;
  error?: string;
}

interface PwcResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runPwc(session: string, args: string[]): PwcResult {
  const full = ["-s", session, ...args];
  const res = spawnSync("playwright-cli", full, {
    encoding: "utf-8",
    cwd: REPO_ROOT,
  });
  if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
    const fallback = spawnSync(
      "npx",
      ["--no-install", "playwright-cli", ...full],
      {
        encoding: "utf-8",
        cwd: REPO_ROOT,
      },
    );
    return {
      stdout: fallback.stdout ?? "",
      stderr: fallback.stderr ?? "",
      code: fallback.status,
    };
  }
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    code: res.status,
  };
}

function resolveBaseUrl(args: Record<string, string | true>): string {
  const explicit = args["base-url"];
  if (typeof explicit === "string") return explicit.replace(/\/$/, "");
  const target = args["target"];
  if (target === "test") return "http://localhost:3002";
  if (target === "dev" || target === undefined) return "http://localhost:3000";
  throw new Error(`Unknown --target=${String(target)} (expected dev or test)`);
}

async function attachAuthCookies(
  session: string,
  baseUrl: string,
  story: Story,
): Promise<{ ok: boolean; detail: string }> {
  if (!story.login || !story.password) {
    return { ok: true, detail: "no credentials in story — skipping login" };
  }
  const url = `${baseUrl}/api/auth/sign-in/email`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ email: story.login, password: story.password }),
  });
  if (!resp.ok) {
    return {
      ok: false,
      detail: `sign-in failed: ${resp.status} ${resp.statusText}`,
    };
  }
  const setCookieHeaders = resp.headers.getSetCookie();
  const host = new URL(baseUrl).hostname;
  for (const header of setCookieHeaders) {
    const [pair] = header.split(";");
    if (!pair) continue;
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const name = pair.slice(0, eqIdx);
    const value = pair.slice(eqIdx + 1);
    // playwright-cli cookie-set is the canonical way to attach a cookie to a
    // running session; we keep it minimal (name, value, domain, path).
    const res = runPwc(session, [
      "cookie-set",
      `--name=${name}`,
      `--value=${value}`,
      `--domain=${host}`,
      "--path=/",
    ]);
    if (res.code !== 0) {
      return {
        ok: false,
        detail: `cookie-set ${name} failed: ${res.stderr || res.stdout}`,
      };
    }
  }
  return { ok: true, detail: `attached ${setCookieHeaders.length} cookie(s)` };
}

async function seedMockContext(
  baseUrl: string,
  ctx: Record<string, string | number>,
): Promise<{ ok: boolean; detail: string }> {
  const stringified: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) stringified[k] = String(v);
  const resp = await fetch(`${baseUrl}/api/test/mock-context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context: stringified }),
  });
  if (!resp.ok) {
    return {
      ok: false,
      detail: `mock-context POST failed: ${resp.status} ${resp.statusText}`,
    };
  }
  return { ok: true, detail: `seeded ${Object.keys(ctx).length} key(s)` };
}

function waitForExpr(selector: string, timeoutMs: number): string {
  const sel = JSON.stringify(selector);
  return `(async () => {
    const deadline = Date.now() + ${timeoutMs};
    while (Date.now() < deadline) {
      if (document.querySelector(${sel})) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('wait_for timeout: ' + ${sel});
  })()`;
}

function existsExpr(selector: string): string {
  return `document.querySelector(${JSON.stringify(selector)}) !== null`;
}

function textIncludesExpr(selector: string, text: string): string {
  return `(document.querySelector(${JSON.stringify(selector)})?.textContent ?? '').includes(${JSON.stringify(text)})`;
}

function runStep(
  session: string,
  step: Step,
  screenshotsDir: string,
  index: number,
): StepResult {
  const started = Date.now();
  const result = (
    ok: boolean,
    detail?: string,
    error?: string,
  ): StepResult => ({
    index,
    kind: step.kind,
    ok,
    duration_ms: Date.now() - started,
    ...(detail !== undefined ? { detail } : {}),
    ...(error !== undefined ? { error } : {}),
  });

  switch (step.kind) {
    case "wait_for": {
      const expr = waitForExpr(step.selector, step.timeout_ms ?? 10_000);
      const res = runPwc(session, ["--raw", "eval", expr]);
      if (res.code !== 0)
        return result(false, undefined, res.stderr || res.stdout);
      return result(true, `selector ${step.selector} appeared`);
    }
    case "click": {
      const res = runPwc(session, ["click", step.ref]);
      if (res.code !== 0)
        return result(false, undefined, res.stderr || res.stdout);
      return result(true, `clicked ${step.ref}`);
    }
    case "type": {
      const res = runPwc(session, ["fill", step.ref, step.text]);
      if (res.code === 0) return result(true, `filled ${step.ref}`);
      // Fallback: some refs (raw editor surfaces) aren't fill-compatible; try click+type.
      const clickRes = runPwc(session, ["click", step.ref]);
      if (clickRes.code !== 0) {
        return result(false, undefined, clickRes.stderr || clickRes.stdout);
      }
      const typeRes = runPwc(session, ["type", step.text]);
      if (typeRes.code !== 0) {
        return result(false, undefined, typeRes.stderr || typeRes.stdout);
      }
      return result(true, `clicked+typed into ${step.ref}`);
    }
    case "press": {
      const res = runPwc(session, ["press", step.key]);
      if (res.code !== 0)
        return result(false, undefined, res.stderr || res.stdout);
      return result(true, `pressed ${step.key}`);
    }
    case "screenshot": {
      const filename = step.filename.endsWith(".png")
        ? step.filename
        : `${step.filename}.png`;
      const absPath = path.join(screenshotsDir, filename);
      const args = ["screenshot", `--filename=${absPath}`];
      if (step.ref) args.push(step.ref);
      const res = runPwc(session, args);
      if (res.code !== 0)
        return result(false, undefined, res.stderr || res.stdout);
      return result(true, `wrote ${path.relative(REPO_ROOT, absPath)}`);
    }
    case "expect_dom": {
      const res = runPwc(session, ["--raw", "eval", existsExpr(step.selector)]);
      if (res.code !== 0)
        return result(false, undefined, res.stderr || res.stdout);
      const actual = res.stdout.trim() === "true";
      if (actual !== step.exists) {
        return result(
          false,
          undefined,
          `expected exists=${step.exists}, got ${actual}`,
        );
      }
      return result(true, `exists=${actual}`);
    }
    case "expect_text": {
      const expr = textIncludesExpr(step.selector, step.text);
      const res = runPwc(session, ["--raw", "eval", expr]);
      if (res.code !== 0)
        return result(false, undefined, res.stderr || res.stdout);
      if (res.stdout.trim() !== "true") {
        return result(false, undefined, `text not found in ${step.selector}`);
      }
      return result(true, `text matched in ${step.selector}`);
    }
    case "eval": {
      const res = runPwc(session, ["--raw", "eval", step.expr]);
      if (res.code !== 0)
        return result(false, undefined, res.stderr || res.stdout);
      if (step.expect !== undefined) {
        const got = res.stdout.trim();
        const want = JSON.stringify(step.expect);
        if (got !== want) {
          return result(false, undefined, `expected ${want}, got ${got}`);
        }
      }
      return result(true, `eval ok`);
    }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let args: Record<string, string | true>;
  try {
    args = parseArgs(argv, ALLOWED_FLAGS as ReadonlyArray<string>);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\n${HELP}`);
    process.exit(2);
  }
  if (args["help"]) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const storyPath = args["story"];
  if (typeof storyPath !== "string") {
    process.stderr.write(`Missing required --story=<path>\n\n${HELP}`);
    process.exit(2);
  }

  const baseUrl = resolveBaseUrl(args);
  const session =
    typeof args["session"] === "string" ? args["session"] : "vernissage";

  let raw: unknown;
  try {
    raw = await loadJson(path.resolve(REPO_ROOT, storyPath));
  } catch (e) {
    process.stderr.write(
      `Failed to load story at ${storyPath}: ${(e as Error).message}\n`,
    );
    process.exit(2);
  }

  const validation = validateStory(raw);
  if (!validation.ok) {
    process.stderr.write(
      `Invalid story:\n  - ${validation.errors.join("\n  - ")}\n`,
    );
    process.exit(2);
  }
  const story = validation.story;

  const outDir =
    typeof args["out"] === "string"
      ? path.resolve(REPO_ROOT, args["out"])
      : path.resolve(REPO_ROOT, "vernissage", story.id);
  const screenshotsDir = path.join(outDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const stepResults: StepResult[] = [];

  // Open the entry URL.
  const openRes = runPwc(session, ["open", `${baseUrl}${story.url}`]);
  if (openRes.code !== 0) {
    process.stderr.write(
      `playwright-cli open failed (is it installed and is ${baseUrl} reachable?):\n${
        openRes.stderr || openRes.stdout
      }\n`,
    );
    process.exit(3);
  }

  const authStep = await attachAuthCookies(session, baseUrl, story);
  if (!authStep.ok) {
    process.stderr.write(`auth setup failed: ${authStep.detail}\n`);
    stepResults.push({
      index: -1,
      kind: "eval",
      ok: false,
      duration_ms: 0,
      detail: "auth",
      error: authStep.detail,
    });
  }

  // After cookies are attached we must re-navigate so the page picks them up.
  if (authStep.ok && story.login) {
    runPwc(session, ["goto", `${baseUrl}${story.url}`]);
  }

  if (story.mockContext) {
    const mockStep = await seedMockContext(baseUrl, story.mockContext);
    if (!mockStep.ok) {
      stepResults.push({
        index: -1,
        kind: "eval",
        ok: false,
        duration_ms: 0,
        detail: "mock-context",
        error: mockStep.detail,
      });
    }
  }

  for (let i = 0; i < story.steps.length; i++) {
    const step = story.steps[i];
    if (!step) continue;
    const result = runStep(session, step, screenshotsDir, i);
    stepResults.push(result);
    if (!result.ok) break;
  }

  runPwc(session, ["close"]);

  const failures = stepResults.filter((r) => !r.ok);
  const log = {
    story_id: story.id,
    title: story.title,
    base_url: baseUrl,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    total_steps: story.steps.length,
    executed_steps: stepResults.length,
    failures: failures.length,
    steps: stepResults,
  };
  await writeFile(
    path.join(outDir, "log.json"),
    `${JSON.stringify(log, null, 2)}\n`,
  );

  if (failures.length > 0) {
    await writeFile(
      path.join(outDir, "failures.json"),
      `${JSON.stringify(failures, null, 2)}\n`,
    );
    process.stdout.write(
      `vernissage walk FAILED: ${failures.length}/${stepResults.length} step(s) failed → ${path.relative(REPO_ROOT, outDir)}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(
    `vernissage walk OK: ${stepResults.length}/${story.steps.length} step(s) → ${path.relative(REPO_ROOT, outDir)}\n`,
  );
}

main().catch((e: unknown) => {
  process.stderr.write(`vernissage-walk crashed: ${(e as Error).message}\n`);
  process.exit(99);
});
