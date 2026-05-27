import type { GlobalContext } from "@oh-writers/domain";
import { formatGlobalContext as formatBible } from "@oh-writers/domain";

/**
 * Serialises GlobalContext into the text of the second cached system prompt block.
 * When a bible is present this delegates to the domain formatter (already tested).
 * When there is no bible yet, emits a sentinel string so the block position is
 * stable and the Anthropic cache checkpoint does not shift.
 */
export const serializeGlobalContext = (ctx: GlobalContext): string => {
  if (ctx.bible !== null) return formatBible(ctx.bible);

  return `[FILM BIBLE]\n(not yet distilled)\n\nPROJECT: ${ctx.projectTitle}\nGenre: ${ctx.genre ?? "unknown"}\nFormat: ${ctx.format}`;
};
