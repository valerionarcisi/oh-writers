import { CESARE_DOCUMENT_TOOLS, executeDocumentTool } from "../cesare-tools";
import {
  CESARE_DOCUMENT_GEN_TOOLS,
  executeDocumentGenTool,
  isDocumentGenToolName,
} from "../cesare-document-tools";
import { tryExecuteReadTool } from "../cesare-read-tools";
import type { DocumentContext } from "../cesare-tools";
import type { Skill, SkillBuildContext } from "./types";

export type { DocumentContext };

// ─── Guidance builder ─────────────────────────────────────────────────────────

const DOCUMENT_LABELS: Record<string, string> = {
  logline: "Logline",
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
};

const buildDocumentEditGuidance = (docType: string): string => {
  const label = DOCUMENT_LABELS[docType] ?? docType.toUpperCase();
  return `\n\nSTRUMENTI DISPONIBILI SU QUESTO ${label.toUpperCase()}:
- apply_text_edit(find, replace): sostituisce una stringa esatta del documento. Usa SEMPRE testo letterale presente nel DOCUMENTO ATTIVO sopra.
- expand_section(heading): espande la sezione sotto un heading in 2-3 paragrafi.
- compress_section(heading, target_words): comprime una sezione mantenendo i beat.

Quando l'utente chiede una modifica concreta (riscrivi, cambia, espandi, accorcia, sostituisci) USA SEMPRE il tool appropriato — non limitarti a suggerire il testo nel chat. Conferma in italiano cosa hai fatto dopo ogni edit.

GENERAZIONE DOCUMENTI (propose/accept):
Per richieste che generano un documento intero (logline, sinossi, soggetto v2, scaletta) USA I TOOLS dedicati. Tutto crea una DRAFT visibile in un banner sopra l'editor con i pulsanti "Promuovi a attiva" / "Scarta".

WORKFLOW:
- "genera la logline" / "scrivimi la logline" → propose_logline_from_screenplay({ instruction? })
- "scrivimi la sinossi" / "genera la sinossi" → propose_synopsis_from_screenplay({ instruction? })
- "fammi un v2 del soggetto più [X]" / "riscrivi il soggetto in modo [X]" → propose_soggetto_v2({ instruction: "...", label: "v2 [hint]" })
- "dato il soggetto fammi la scaletta" / "genera la scaletta dal soggetto" → propose_scaletta_from_soggetto({ target_scene_count? })

❌ SBAGLIATO:
"Ora ti scrivo la logline: …"
(Scrive il testo nella chat, non chiama il tool. NON FARE COSÌ.)
"Leggo la sceneggiatura, poi ti scrivo la sinossi qui sotto."
(Stessa cosa. Niente testo nel chat per documenti interi.)

✅ CORRETTO:
[propose_logline_from_screenplay({ instruction: "più commerciale" })]
"Ho generato una logline draft per il progetto. Vai sulla pagina logline per accettarla o scartarla dal banner sopra l'editor."

REGOLA FORTE: se il documento attivo è VUOTO o l'utente chiede "scrivi/genera/crea il [documento]", DEVI chiamare il tool propose_*. Mai scrivere il documento intero nel chat. Sei attualmente sul documento ${label}. Tutti e quattro i tool sono comunque disponibili: se l'utente chiede un documento diverso, eseguilo lo stesso e indica nel messaggio finale dove vedere la draft.`;
};

// ─── Skill factory ────────────────────────────────────────────────────────────
// Note: docCtx carries the live document content for in-memory mutation
// tracking across tool calls within a single Cesare turn. It is passed
// alongside SkillBuildContext because its content changes at runtime.

export const buildDocumentEditSkill = (
  ctx: SkillBuildContext,
  docCtx: DocumentContext,
  userIdFallback: string | null = null,
): Skill => ({
  id: "document-edit",
  // Read tools are provided by the companion read-document skill in PAGE_SKILL_MAP.
  tools: [
    ...CESARE_DOCUMENT_TOOLS,
    ...CESARE_DOCUMENT_GEN_TOOLS,
  ] as Skill["tools"],
  guidanceBlock: buildDocumentEditGuidance(docCtx.documentType),
  executor: (block, db, projectId) => {
    const readResult = tryExecuteReadTool(block, db, projectId);
    if (readResult) return readResult;
    if (isDocumentGenToolName(block.name)) {
      return executeDocumentGenTool(block, db, projectId, userIdFallback);
    }
    return executeDocumentTool(block, db, docCtx);
  },
  requiredData: ["documents"],
});
