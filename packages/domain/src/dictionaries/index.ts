import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ok, err, type Result } from "neverthrow";
import type { Locale } from "../constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class DictionaryLoadError {
  readonly _tag = "DictionaryLoadError" as const;
  readonly message: string;
  constructor(
    readonly locale: Locale,
    readonly cause: unknown,
  ) {
    this.message = `Failed to load dictionary for locale "${locale}"`;
  }
}

export class UnsupportedLocaleError {
  readonly _tag = "UnsupportedLocaleError" as const;
  readonly message: string;
  constructor(readonly locale: string) {
    this.message = `Unsupported locale: "${locale}"`;
  }
}

type DictionaryFile = { version: string; words: string[] };

let enCache: ReadonlySet<string> | null = null;
let itCache: ReadonlySet<string> | null = null;

const loadFile = (
  locale: Locale,
): Result<ReadonlySet<string>, DictionaryLoadError> => {
  try {
    const raw = readFileSync(
      join(__dirname, "data", `${locale}.json`),
      "utf-8",
    );
    const data = JSON.parse(raw) as DictionaryFile;
    return ok(new Set(data.words));
  } catch (e) {
    return err(new DictionaryLoadError(locale, e));
  }
};

export const loadDictionary = (
  locale: Locale,
): Result<
  ReadonlySet<string>,
  DictionaryLoadError | UnsupportedLocaleError
> => {
  if (locale !== "en" && locale !== "it") {
    return err(new UnsupportedLocaleError(locale));
  }
  if (locale === "en") {
    if (!enCache) {
      const result = loadFile("en");
      if (result.isErr()) return result;
      enCache = result.value;
    }
    return ok(enCache);
  }
  if (!itCache) {
    const result = loadFile("it");
    if (result.isErr()) return result;
    itCache = result.value;
  }
  return ok(itCache);
};

export const _resetDictionaryCache = (): void => {
  enCache = null;
  itCache = null;
};
