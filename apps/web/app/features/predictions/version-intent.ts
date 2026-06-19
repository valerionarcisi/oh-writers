// BUG-N66 / Spec 76 — detect when the user explicitly asked Cesare to keep the
// current version and start a new one, so `resolveVersionAction` mints instead
// of overwriting (precedence rule 1) and the large-edit ask is skipped.
//
// Pure and AI-free: a phrase match on the user's instruction. Kept deliberately
// narrow — only clear "new version" intent, never inferred from edit size (that
// is `classifyEditSize`'s job). False negatives are safe (the edit still applies,
// just overwriting); a false positive would mint an unwanted row, so the matchers
// require an explicit version/snapshot verb, not merely the word "versione".

// Each entry is a phrase the writer uses to ask for a fresh version. Matched
// case-insensitively as a substring on the normalised instruction.
const NEW_VERSION_PHRASES = [
  "nuova versione",
  "un'altra versione",
  "altra versione",
  "nuova bozza",
  "salva questa versione",
  "salva la versione",
  "tieni questa versione",
  "tieni questa e",
  "crea una versione",
  "fai una versione",
  "nuovo checkpoint",
] as const;

/**
 * True when the instruction explicitly asks to mint a new version. Empty or
 * null instructions are never a request (the model-driven default is overwrite).
 */
export const userRequestedNewVersion = (
  instruction: string | null | undefined,
): boolean => {
  if (!instruction) return false;
  const normalised = instruction.toLowerCase();
  return NEW_VERSION_PHRASES.some((phrase) => normalised.includes(phrase));
};
