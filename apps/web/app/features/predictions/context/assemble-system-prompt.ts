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
// Incremental replacement for buildSystemPrompt in cesare.server.ts.
// NOT wired into handleAskCesare yet — Agent E performs the swap.
//
// Block layout (positions are fixed for cache stability):
//   [0] ROLE_TEXT                   — ephemeral, never changes
//   [1] GlobalContext (bible)        — ephemeral, changes only when bible is updated
//   [2..N] one block per active skill — ephemeral, stable for same bible + page
//   [N+1] LocalContext               — no cache_control, changes every call

export const assembleSystemPromptV2 = (
  global: GlobalContext,
  skills: ReadonlyArray<Skill>,
  local: LocalContext,
  // Spec 51 — bounded "what we changed before" history (DERIVED). Null when
  // there is no prior edit history. Placed alongside the local context (no
  // cache_control) because it changes as edits accumulate.
  historyContext: string | null = null,
): SystemPromptBlock[] => [
  { type: "text", text: ROLE_TEXT, cache_control: { type: "ephemeral" } },
  {
    type: "text",
    text: serializeGlobalContext(global),
    cache_control: { type: "ephemeral" },
  },
  ...skills.map(
    (s): SystemPromptBlock => ({
      type: "text",
      text: s.guidanceBlock,
      cache_control: { type: "ephemeral" },
    }),
  ),
  { type: "text", text: formatLocalContext(local) },
  ...(historyContext !== null
    ? [{ type: "text" as const, text: historyContext }]
    : []),
];
