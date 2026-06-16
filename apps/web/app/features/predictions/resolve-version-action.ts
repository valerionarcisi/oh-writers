import { classifyEditSize } from "./classify-edit-size";

// BUG-N66 / Spec 76 — decide what a Cesare edit does to the version history.
// Pure, AI-free, the single source of truth for the policy so the two commit
// seams (applyVersionLive + persistDocumentContent) can never drift.
//
//   overwrite → update the active version row in place (no flood)
//   mint      → INSERT a new numbered version (a real checkpoint)
//   ask       → the edit is large and unconfirmed; stream the ask, apply nothing
//               this turn (the follow-up turn arrives with largeEditConfirmed)
export type VersionAction = "overwrite" | "mint" | "ask";

export interface ResolveVersionActionInput {
  /** The active version's content (the overwrite target). Empty ⇒ first write. */
  readonly previousContent: string;
  /** The content Cesare wants to apply this turn. */
  readonly nextContent: string;
  /** The user explicitly asked for a new version ("fanne una nuova versione"). */
  readonly userRequestedNewVersion: boolean;
  /** A prior turn asked, the user chose "Nuova versione", and this is the apply. */
  readonly largeEditConfirmed: boolean;
}

/**
 * Resolve the version action by precedence (Spec 76):
 *   1. user explicitly asked          → mint
 *   2. first write (no current row)   → mint
 *   3. large edit, confirmed          → mint
 *   4. large edit, not yet confirmed  → ask
 *   5. otherwise (small edit)         → overwrite
 */
export const resolveVersionAction = (
  input: ResolveVersionActionInput,
): VersionAction => {
  if (input.userRequestedNewVersion) return "mint";

  const isFirstWrite = input.previousContent.trim().length === 0;
  if (isFirstWrite) return "mint";

  const size = classifyEditSize(input.previousContent, input.nextContent);
  if (size === "small") return "overwrite";

  // large edit
  return input.largeEditConfirmed ? "mint" : "ask";
};
