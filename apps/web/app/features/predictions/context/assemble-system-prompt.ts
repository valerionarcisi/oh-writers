import type { GlobalContext, LocalContext } from "@oh-writers/domain";
import type { Skill } from "../skills/types";
import type { SystemPromptBlock } from "../cesare.server";
import { serializeGlobalContext } from "./format-global-context";
import { formatLocalContext } from "./format-local-context";

// ─── Role text ────────────────────────────────────────────────────────────────
// Exact copy of the constant in cesare.server.ts. Block position 0 in the
// Anthropic cache — must never change between calls so the checkpoint is stable.
// Do NOT move this constant out of cesare.server.ts; this is a deliberate copy
// per the incremental migration plan (Agent E will do the final swap).

const ROLE_TEXT = `Sei Cesare, l'assistente AI di Oh Writers, ispirato a Cesare Zavattini.
Non sei un chatbot generico. Conosci l'intera produzione del film su cui stai lavorando.

Rispondi in italiano. Sii concreto e specifico — non generare testo generico.
Quando suggerisci modifiche alla sceneggiatura, usa il formato Fountain.
Quando parli di costi, usa i numeri reali dal budget.
Quando parli di disponibilità, usa i dati reali dello schedule.
Quando parli di location, aiuta il regista a valutare i candidati in base al contesto narrativo della scena.
Quando hai il testo della sceneggiatura, citalo esplicitamente nelle tue risposte.`;

// ─── Assembler v2 ─────────────────────────────────────────────────────────────
// Live system-prompt assembler (wired into handleAskCesareV2 in cesare.server.ts).
//
// Block layout (positions are fixed for cache stability):
//   [0] MEGA_STATIC = ROLE_TEXT + GlobalContext (bible) + every skill's
//       guidanceBlock, joined into ONE string — ephemeral, single cache
//       breakpoint. Bible and the active skill set change together in
//       practice (same page/project), so splitting them into separate
//       breakpoints buys no real independent-invalidation benefit while
//       burning 2-11 of Anthropic's 4-breakpoint-per-request cap. Collapsing
//       to one block also guarantees a byte-identical prefix — no risk of
//       sub-blocks drifting out of sync with each other.
//   [1] LocalContext   — no cache_control, changes every call
//   [2] historyContext — no cache_control, changes as edits accumulate
// Plus the tool-array breakpoint set by withCachedTools (cesare-tools.ts) —
// 2 breakpoints total per request, well under the 4-breakpoint cap.

const BLOCK_SEPARATOR = "\n\n---\n\n";

export const assembleSystemPromptV2 = (
  global: GlobalContext,
  skills: ReadonlyArray<Skill>,
  local: LocalContext,
  // Spec 51 — bounded "what we changed before" history (DERIVED). Null when
  // there is no prior edit history. Placed alongside the local context (no
  // cache_control) because it changes as edits accumulate.
  historyContext: string | null = null,
): SystemPromptBlock[] => {
  const megaStatic = [
    ROLE_TEXT,
    serializeGlobalContext(global),
    ...skills.map((s) => s.guidanceBlock),
  ].join(BLOCK_SEPARATOR);

  return [
    { type: "text", text: megaStatic, cache_control: { type: "ephemeral" } },
    { type: "text", text: formatLocalContext(local) },
    ...(historyContext !== null
      ? [{ type: "text" as const, text: historyContext }]
      : []),
  ];
};
