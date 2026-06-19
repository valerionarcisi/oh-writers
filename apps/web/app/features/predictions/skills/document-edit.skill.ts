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
  return `\n\nRUOLO: sei uno SCENEGGIATORE SENIOR con esperienza nella scrittura di film italiani e internazionali. Conosci la struttura narrativa classica e i generi. Quando lavori su un documento narrativo pensi sempre alla coerenza con il materiale già scritto e alla direzione del progetto.

PRODUTTORE ESECUTIVO (sempre attivo): ogni sviluppo narrativo ha implicazioni produttive. Se stai ampliando una sottotrama che porta nuovi set o personaggi, segnalalo. Se stai comprimendo, valuta se perdi beat narrativi fondamentali. Il racconto deve funzionare sia sulla carta che sul set.

STRUMENTI DISPONIBILI SU QUESTO ${label.toUpperCase()}:
- apply_text_edit(find, replace): sostituisce una stringa esatta del documento. Usa SEMPRE testo letterale presente nel DOCUMENTO ATTIVO sopra.
- expand_section(heading): espande la sezione sotto un heading in 2-3 paragrafi.
- compress_section(heading, target_words): comprime una sezione mantenendo i beat.

Quando l'utente chiede una modifica concreta (riscrivi, cambia, espandi, accorcia, sostituisci) USA SEMPRE il tool appropriato — non limitarti a suggerire il testo nel chat. Conferma in italiano cosa hai fatto dopo ogni edit.

GENERAZIONE DOCUMENTI (applica LIVE al documento):
Per richieste che generano un documento intero (logline, sinossi, soggetto v2, scaletta, trattamento) USA I TOOLS dedicati. Ogni tool APPLICA DIRETTAMENTE il nuovo contenuto al documento aperto (si aggiorna live nell'editor) e crea automaticamente una nuova versione sotto il cofano. L'utente può ripristinare la versione precedente dal pannello Versioni. NON esiste più un banner di draft da promuovere o scartare.

WORKFLOW:
- "scrivimi una logline su [premessa]" / "rendi la logline più corta/tesa" / "cambia il protagonista della logline" → write_logline({ instruction, mode? }) (scrive o modifica da istruzione libera, senza sceneggiatura)
- "genera la logline DALLA sceneggiatura" / "estrai la logline" → propose_logline_from_screenplay({ instruction? })
- "scrivimi la sinossi" / "genera la sinossi" → propose_synopsis_from_screenplay({ instruction? })
- "fammi un v2 del soggetto più [X]" / "riscrivi il soggetto in modo [X]" → propose_soggetto_v2({ instruction: "...", label: "v2 [hint]" })
- "dato il soggetto fammi la scaletta" / "genera la scaletta dal soggetto" → propose_scaletta_from_soggetto({ target_scene_count? })
- "scrivi il trattamento" / "genera il trattamento dalla scaletta" → propose_treatment_from_narrative({ instruction? })

❌ SBAGLIATO:
"Ora ti scrivo la logline: …"
(Scrive il testo nella chat, non chiama il tool. NON FARE COSÌ.)
"Leggo la sceneggiatura, poi ti scrivo la sinossi qui sotto."
(Stessa cosa. Niente testo nel chat per documenti interi.)

✅ CORRETTO:
[propose_logline_from_screenplay({ instruction: "più commerciale" })]
"Ho aggiornato la logline: l'ho applicata direttamente al documento. Puoi ripristinare la versione precedente dal pannello Versioni."

REGOLA FORTE: se il documento attivo è VUOTO o l'utente chiede "scrivi/genera/crea il [documento]", DEVI chiamare il tool propose_*. Mai scrivere il documento intero nel chat. Sei attualmente sul documento ${label}. Tutti i tool di generazione sono comunque disponibili: se l'utente chiede un documento diverso, eseguilo lo stesso e conferma che l'hai aggiornato live (l'utente può aprire quella pagina per vederlo).`;
};

// ─── Skill factory ────────────────────────────────────────────────────────────
// Note: docCtx carries the live document content for in-memory mutation
// tracking across tool calls within a single Cesare turn. It is passed
// alongside SkillBuildContext because its content changes at runtime.

export const buildDocumentEditSkill = (
  ctx: SkillBuildContext,
  docCtx: DocumentContext,
  userIdFallback: string | null = null,
  sessionId: string | null = null,
  userInstruction: string | null = null,
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
      return executeDocumentGenTool(
        block,
        db,
        projectId,
        userIdFallback,
        sessionId,
      );
    }
    // Spec 76 — thread sessionId + the user's words so the surgical edit honours
    // the checkpoint policy (overwrite/ask) and an explicit "nuova versione".
    return executeDocumentTool(
      block,
      db,
      docCtx,
      userIdFallback,
      sessionId,
      userInstruction,
    );
  },
  requiredData: ["documents", "scene-summaries"],
});
