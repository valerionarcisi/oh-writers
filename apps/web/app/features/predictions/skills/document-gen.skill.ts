import {
  CESARE_DOCUMENT_GEN_TOOLS,
  executeDocumentGenTool,
  isDocumentGenToolName,
} from "../cesare-document-tools";
import { okAsync } from "neverthrow";
import type { Skill, SkillBuildContext, ToolResult } from "./types";

// ─── document-gen skill ───────────────────────────────────────────────────────
// Cross-domain document generation. Unlike `document-edit`, these tools resolve
// their TARGET document by projectId + document type internally (see
// executeDocumentGenTool) and auto-create a version via applyVersionLive, so
// they need NO live DocumentContext. That makes them safe to expose from ANY
// page: a request issued on the Sceneggiatura page can `propose_soggetto_v2`
// and write the Soggetto, with a version auto-created first (agentic-edit
// pattern). This is the universal-dispatch entry point for document writes
// (spec 47b). The page-bound section tools (apply_text_edit / expand_section /
// compress_section) stay in `document-edit` because they DO need the active
// document content.

// Spec 75 (BUG-N66) — the versioning policy block shared by the document-gen
// and document-edit guidance. Default: stay on the current working version
// (overwrite); a NEW version only on an explicit user request; for a large
// change Cesare asks the user before calling the tool.
export const VERSIONING_POLICY_GUIDANCE = `
POLITICA VERSIONI (vale per ogni documento narrativo):
- Di DEFAULT le tue modifiche aggiornano la versione di lavoro corrente: NON passare il parametro versioning, o passa versioning: "overwrite". Iterare con te non deve allungare la lista delle versioni.
- Passa versioning: "new" SOLO quando l'utente chiede ESPLICITAMENTE una nuova versione (es. "fanne una nuova versione", "crea una v2", "salvane una copia come nuova versione").
- Se la modifica richiesta è GRANDE (riscrittura completa di un documento già sostanzioso — non una prima generazione, non un ritocco chirurgico) e l'utente NON ha chiesto una nuova versione, CHIEDI prima in chat: "È una modifica importante: la applico alla versione attuale o ne creo una nuova?" — poi usa versioning in base alla risposta.
- La revertibilità è garantita comunque: la versione precedente al tuo intervento resta nel pannello Versioni come checkpoint.`;

const buildDocumentGenGuidance = (): string =>
  `\n\nGENERAZIONE DOCUMENTI (cross-dominio, applica LIVE):
Puoi generare o riscrivere un documento narrativo del progetto da qualunque pagina. Ogni tool risolve il documento bersaglio dal progetto e lo aggiorna live (la versione precedente al tuo intervento resta ripristinabile dal pannello Versioni).
- "scrivimi una logline su [premessa]" / "rendi la logline più corta/tesa" / "cambia il protagonista della logline" → write_logline({ instruction, mode? }) (scrive o modifica la logline da istruzione libera, senza sceneggiatura)
- "genera la logline DALLA sceneggiatura" / "estrai la logline" → propose_logline_from_screenplay({ instruction? })
- "scrivimi la sinossi" / "genera la sinossi" → propose_synopsis_from_screenplay({ instruction? })
- "fammi un v2 del soggetto più [X]" / "riscrivi il soggetto" → propose_soggetto_v2({ instruction, label })
- "dato il soggetto fammi la scaletta" → propose_scaletta_from_soggetto({ target_scene_count? })
- "scrivi il trattamento" / "genera il trattamento dalla scaletta" → propose_treatment_from_narrative({ instruction? })
- "scrivimi la sceneggiatura" / "la prima stesura della sceneggiatura" / "partendo dal soggetto scrivimi la sceneggiatura" → propose_screenplay_from_narrative({ instruction?, label? }) (crea una DRAFT nel pannello Versioni della Sceneggiatura — NON scrive il trattamento)
Non scrivere mai il documento intero nel chat: usa SEMPRE il tool, anche se sei su un'altra pagina (es. stai sulla Sceneggiatura e l'utente chiede il Soggetto). Conferma in italiano che l'hai aggiornato live.
REGOLA DI FEDELTÀ ALL'ENTITÀ: il documento che l'utente NOMINA vince SEMPRE. Se chiede la SCENEGGIATURA usa propose_screenplay_from_narrative — MAI propose_treatment_from_narrative al suo posto. Non sostituire mai l'entità richiesta con il "passo successivo naturale" della catena narrativa.
${VERSIONING_POLICY_GUIDANCE}`;

// requiredData: [] — these tools read what they need (screenplay / soggetto)
// inside their own executor; they do not depend on buildLocalContext.

export const buildDocumentGenSkill = (
  ctx: SkillBuildContext,
  userIdFallback: string | null = null,
): Skill => ({
  id: "document-gen",
  tools: [...CESARE_DOCUMENT_GEN_TOOLS] as Skill["tools"],
  guidanceBlock: buildDocumentGenGuidance(),
  executor: (block, db, projectId): ReturnType<Skill["executor"]> => {
    if (isDocumentGenToolName(block.name)) {
      return executeDocumentGenTool(
        block,
        db,
        projectId,
        userIdFallback,
        ctx.cesareSessionId,
      );
    }
    const errorResult: ToolResult = {
      type: "tool_result",
      tool_use_id: block.id,
      content: JSON.stringify({
        error: `Unknown document-gen tool: ${block.name}`,
      }),
    };
    return okAsync(errorResult);
  },
  requiredData: [],
});
