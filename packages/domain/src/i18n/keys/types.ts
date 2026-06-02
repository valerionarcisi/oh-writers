/**
 * A per-area translation module exports one `LocaleDict`: an `en` and `it`
 * object with the SAME keys. The dictionary composer (`../keys.ts`) merges all
 * area modules; the completeness test enforces EN key set == IT across the
 * merged result. Each feature area owns its own file so fleet agents extracting
 * strings never edit the same module (no merge conflicts).
 */
export type LocaleDict = {
  readonly en: Readonly<Record<string, string>>;
  readonly it: Readonly<Record<string, string>>;
};
