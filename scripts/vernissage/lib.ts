/**
 * Shared helpers for the vernissage walk + scaffold scripts.
 *
 * Dep-free on purpose — only Node built-ins are imported. Both scripts use
 * `pnpm exec tsx` to run, so this module is consumed as ESM TS.
 *
 * The Story shape is the source of truth for what a "vernissage story" means.
 * Both scripts validate input against it; downstream tools (the scaffold,
 * the orchestrator that fills report.md) read the JSON files directly.
 */
import { readFile } from "node:fs/promises";

export type Step =
  | { kind: "wait_for"; selector: string; timeout_ms?: number }
  | { kind: "click"; ref: string }
  | { kind: "type"; ref: string; text: string }
  | { kind: "press"; key: string }
  | { kind: "screenshot"; filename: string; ref?: string }
  | { kind: "expect_dom"; selector: string; exists: boolean }
  | { kind: "expect_text"; selector: string; text: string }
  | { kind: "eval"; expr: string; expect?: unknown };

export interface Story {
  id: string;
  title: string;
  url: string;
  login?: string;
  password?: string;
  mockContext?: Record<string, string | number>;
  steps: Step[];
}

type ValidationResult =
  | { ok: true; story: Story }
  | { ok: false; errors: string[] };

const STORY_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const STEP_KINDS = new Set([
  "wait_for",
  "click",
  "type",
  "press",
  "screenshot",
  "expect_dom",
  "expect_text",
  "eval",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function validateStep(
  raw: unknown,
  idx: number,
  errors: string[],
): Step | null {
  if (!isObject(raw)) {
    errors.push(`steps[${idx}] is not an object`);
    return null;
  }
  const kind = raw["kind"];
  if (!isString(kind) || !STEP_KINDS.has(kind)) {
    errors.push(
      `steps[${idx}].kind must be one of ${[...STEP_KINDS].join(", ")}`,
    );
    return null;
  }
  switch (kind) {
    case "wait_for": {
      const selector = raw["selector"];
      if (!isString(selector)) {
        errors.push(`steps[${idx}].selector must be string`);
        return null;
      }
      const timeoutRaw = raw["timeout_ms"];
      if (timeoutRaw !== undefined && typeof timeoutRaw !== "number") {
        errors.push(`steps[${idx}].timeout_ms must be a number`);
        return null;
      }
      return { kind, selector, timeout_ms: timeoutRaw as number | undefined };
    }
    case "click": {
      const ref = raw["ref"];
      if (!isString(ref)) {
        errors.push(`steps[${idx}].ref must be string`);
        return null;
      }
      return { kind, ref };
    }
    case "type": {
      const ref = raw["ref"];
      const text = raw["text"];
      if (!isString(ref) || !isString(text)) {
        errors.push(`steps[${idx}].ref and .text must be strings`);
        return null;
      }
      return { kind, ref, text };
    }
    case "press": {
      const key = raw["key"];
      if (!isString(key)) {
        errors.push(`steps[${idx}].key must be string`);
        return null;
      }
      return { kind, key };
    }
    case "screenshot": {
      const filename = raw["filename"];
      if (!isString(filename)) {
        errors.push(`steps[${idx}].filename must be string`);
        return null;
      }
      const ref = raw["ref"];
      if (ref !== undefined && !isString(ref)) {
        errors.push(`steps[${idx}].ref must be string when present`);
        return null;
      }
      return { kind, filename, ref: ref as string | undefined };
    }
    case "expect_dom": {
      const selector = raw["selector"];
      const exists = raw["exists"];
      if (!isString(selector) || typeof exists !== "boolean") {
        errors.push(
          `steps[${idx}].selector must be string, .exists must be boolean`,
        );
        return null;
      }
      return { kind, selector, exists };
    }
    case "expect_text": {
      const selector = raw["selector"];
      const text = raw["text"];
      if (!isString(selector) || !isString(text)) {
        errors.push(`steps[${idx}].selector and .text must be strings`);
        return null;
      }
      return { kind, selector, text };
    }
    case "eval": {
      const expr = raw["expr"];
      if (!isString(expr)) {
        errors.push(`steps[${idx}].expr must be string`);
        return null;
      }
      return { kind, expr, expect: raw["expect"] };
    }
    default:
      return null;
  }
}

export function validateStory(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(raw))
    return { ok: false, errors: ["story root is not an object"] };

  const id = raw["id"];
  const title = raw["title"];
  const url = raw["url"];
  const steps = raw["steps"];

  if (!isString(id) || !STORY_ID_PATTERN.test(id)) {
    errors.push(
      `id must be a lowercase slug matching ${STORY_ID_PATTERN.source} (got ${JSON.stringify(id)})`,
    );
  }
  if (!isString(title)) errors.push("title must be a string");
  if (!isString(url)) errors.push("url must be a string");
  if (!Array.isArray(steps)) errors.push("steps must be an array");

  const login = raw["login"];
  const password = raw["password"];
  if (login !== undefined && !isString(login))
    errors.push("login must be string");
  if (password !== undefined && !isString(password))
    errors.push("password must be string");

  const mockContext = raw["mockContext"];
  if (mockContext !== undefined) {
    if (!isObject(mockContext)) {
      errors.push("mockContext must be an object");
    } else {
      for (const [k, v] of Object.entries(mockContext)) {
        if (typeof v !== "string" && typeof v !== "number") {
          errors.push(`mockContext.${k} must be string or number`);
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const validatedSteps: Step[] = [];
  for (let i = 0; i < (steps as unknown[]).length; i++) {
    const step = validateStep((steps as unknown[])[i], i, errors);
    if (step !== null) validatedSteps.push(step);
  }
  if (errors.length > 0) return { ok: false, errors };

  const story: Story = {
    id: id as string,
    title: title as string,
    url: url as string,
    steps: validatedSteps,
  };
  if (isString(login)) story.login = login;
  if (isString(password)) story.password = password;
  if (isObject(mockContext)) {
    story.mockContext = mockContext as Record<string, string | number>;
  }
  return { ok: true, story };
}

export async function loadJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as unknown;
}

/**
 * Escapes a string for embedding inside a `/.../i` JavaScript regex literal.
 * Used by the scaffold to derive a `match` pattern from the first user prompt.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

export type ParsedArgs = Record<string, string | true>;

/**
 * Tiny argv parser. Accepts `--key=value`, `--flag`, and stops at the first
 * positional argument. Throws on unknown flags so typos surface immediately.
 *
 * Pass `allowed` as the exhaustive list of flag names (without leading `--`).
 */
export function parseArgs(
  argv: string[],
  allowed: ReadonlyArray<string>,
): ParsedArgs {
  const result: ParsedArgs = {};
  const allowedSet = new Set(allowed);
  for (const token of argv) {
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
    const stripped = token.slice(2);
    const eqIdx = stripped.indexOf("=");
    const key = eqIdx === -1 ? stripped : stripped.slice(0, eqIdx);
    const value = eqIdx === -1 ? true : stripped.slice(eqIdx + 1);
    if (!allowedSet.has(key)) {
      throw new Error(
        `Unknown flag --${key}. Allowed: ${[...allowedSet].map((k) => `--${k}`).join(", ")}`,
      );
    }
    result[key] = value;
  }
  return result;
}
