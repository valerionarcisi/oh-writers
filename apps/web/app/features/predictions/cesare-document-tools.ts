import { tool } from "ai";
import { z } from "zod";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { eq, sql } from "drizzle-orm";
import {
  documents,
  documentVersions,
  projects,
  screenplays,
} from "@oh-writers/db/schema";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { callHaiku, streamGeneration, extractText } from "~/features/ai";
import {
  parseOutline,
  serializeOutline,
  type OutlineContent,
  type OutlineScene,
} from "~/features/documents";
import { repairMojibake, sanitizeAiText } from "@oh-writers/utils";
import { QUALITY_TIER_MODEL } from "./cesare-model-router";
import { CesareError } from "./cesare.errors";
import {
  applyVersionLive,
  commitOrAsk,
  isAsked,
  type CreatedDraft,
  type CommitOptions,
  type CommitOutcome,
  type AskedNewVersion,
} from "./auto-version.effect";
import {
  userRequestedNewVersion,
  userConfirmedOverwrite,
} from "./version-intent";

// BUG-N66 / Spec 76 — the commit policy for a Cesare document edit. A non-null
// sessionId activates overwrite-into-one-working-row; an explicit "nuova
// versione" instruction forces a mint (precedence rule 1). `largeEditConfirmed`
// is set only on the follow-up turn after the streamed ask-card (Slice 2).
//
// Spec 78 §A5 — the large-edit ask-loop fix. The confirm-card choice is re-sent
// as a USER MESSAGE ("…fanne una nuova versione…" / "Sovrascrivi…"), but the
// model re-runs the edit with its own paraphrased tool `instruction`, which may
// drop the trigger word — so reading the choice from the tool argument alone made
// the confirmation fragile and PER TOOL: a second tool in the same turn re-asked
// and overrode the user's answer (the loop). The user's turn message is identical
// for every tool in the turn, so OR-ing it in makes the confirmed decision STICKY
// for the whole turn — once the writer answered the ask, no tool re-asks the same
// decision.
const commitOptions = (
  sessionId: string | null,
  instruction: string | null | undefined,
  userInstruction: string | null = null,
): CommitOptions => ({
  sessionId,
  userRequestedNewVersion:
    userRequestedNewVersion(instruction) ||
    userRequestedNewVersion(userInstruction),
  largeEditConfirmed: false,
  // "Sovrascrivi" on the ask card → apply the large edit in place. Detected from
  // the re-sent confirmation phrasing (the turn message), mirroring the
  // new-version intent.
  largeEditOverwriteConfirmed:
    userConfirmedOverwrite(instruction) ||
    userConfirmedOverwrite(userInstruction),
});
import {
  importAsActiveVersionTx,
  normaliseScreenplayFountain,
} from "~/features/screenplay-editor";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const CESARE_DOCUMENT_GEN_TOOLS = [
  {
    name: "propose_logline_from_screenplay",
    description:
      "Estrae una logline (max 200 caratteri) DALLA SCENEGGIATURA esistente del progetto. " +
      "Applica live una nuova logline al documento (si aggiorna nell'editor) e crea automaticamente una versione. " +
      "L'utente può ripristinare la versione precedente dal pannello Versioni. Usa questo tool SOLO quando l'utente chiede esplicitamente " +
      "di derivare/estrarre la logline DALLA sceneggiatura (es. 'genera la logline dalla sceneggiatura'). " +
      "Per scrivere una logline da un'istruzione libera o per modificare quella esistente usa invece write_logline.",
    input_schema: {
      type: "object" as const,
      properties: {
        instruction: {
          type: "string",
          description:
            "Istruzione opzionale che orienta lo stile (es. 'più commerciale', 'focus su personaggio', 'tono ironico')",
        },
      },
    },
  },
  {
    name: "write_logline",
    description:
      "Scrive o modifica la logline del progetto (max 200 caratteri) da un'istruzione in linguaggio naturale, " +
      "SENZA bisogno della sceneggiatura. Applica live la nuova logline al documento e crea automaticamente una versione " +
      "(l'utente può ripristinare la versione precedente dal pannello Versioni). Usa questo tool quando l'utente: " +
      "(a) chiede di SCRIVERE una logline da una premessa ('scrivimi una logline su un detective che…'), oppure " +
      "(b) chiede di MODIFICARE la logline esistente ('rendila più corta', 'più tesa', 'cambia il protagonista'). " +
      "Disponibile da qualunque pagina.",
    input_schema: {
      type: "object" as const,
      properties: {
        instruction: {
          type: "string",
          description:
            "L'istruzione in linguaggio naturale: la premessa da cui scrivere la logline, oppure la modifica da applicare a quella esistente.",
        },
        mode: {
          type: "string",
          enum: ["auto", "write", "edit"],
          description:
            "Opzionale. 'write' = scrivi una logline nuova ignorando l'esistente; 'edit' = riscrivi quella esistente seguendo l'istruzione; 'auto' (default) = modifica se ne esiste già una, altrimenti ne scrive una nuova.",
        },
      },
      required: ["instruction"],
    },
  },
  {
    name: "propose_synopsis_from_screenplay",
    description:
      "Genera una sinossi (2-3 paragrafi, circa 400 parole) dalla sceneggiatura corrente del " +
      "progetto. Applica live la nuova sinossi al documento e crea automaticamente una versione. Usa SEMPRE questo tool quando " +
      "l'utente chiede 'scrivimi la sinossi' o 'genera la sinossi'.",
    input_schema: {
      type: "object" as const,
      properties: {
        instruction: {
          type: "string",
          description:
            "Istruzione opzionale per orientare tono/struttura della sinossi.",
        },
      },
    },
  },
  {
    name: "propose_soggetto_v2",
    description:
      "Riscrive il soggetto del progetto applicandolo live al documento (crea automaticamente una versione) seguendo l'istruzione " +
      "fornita. Usa quando l'utente vuole una variante del soggetto (es. 'più asciutto', " +
      "'più tematico', 'fammi un v2 con focus su X').",
    input_schema: {
      type: "object" as const,
      properties: {
        instruction: {
          type: "string",
          description:
            "Direzione della riscrittura in linguaggio naturale (es. 'più asciutto e tematico').",
        },
        label: {
          type: "string",
          description:
            "Etichetta breve per la nuova versione draft (es. 'v2 asciutto', 'focus tematico').",
        },
      },
      required: ["instruction", "label"],
    },
  },
  {
    name: "propose_scaletta_from_soggetto",
    description:
      "Genera l'INTERA scaletta (lista numerata di scene/sequenze) DA ZERO a partire dal soggetto corrente. " +
      "Sostituisce tutte le scene. Applica live la nuova scaletta al documento e crea automaticamente una versione. " +
      "Usa SOLO quando l'utente vuole (ri)generare l'intera scaletta ('dato il soggetto fammi la scaletta', " +
      "'rigenera tutta la scaletta'). Per modificare UNA scena esistente usa invece edit_outline_scene.",
    input_schema: {
      type: "object" as const,
      properties: {
        target_scene_count: {
          type: "integer",
          description:
            "Numero approssimativo di scene desiderate. Ometti per usare un " +
            "default adatto al formato del progetto (corto ~14, episodio ~28, " +
            "lungometraggio ~45). Specificalo solo se l'utente chiede una " +
            "lunghezza precisa.",
        },
      },
    },
  },
  {
    name: "edit_outline_scene",
    description:
      "Modifica la descrizione di UNA singola scena esistente della scaletta, lasciando invariate tutte le altre. " +
      "Applica live la modifica e crea automaticamente una versione. Usa SEMPRE questo tool (NON " +
      "propose_scaletta_from_soggetto) quando l'utente chiede una modifica mirata a una scena specifica " +
      "(es. 'accorcia la scena 1', 'rendi più tesa la scena 3', 'riscrivi la descrizione della scena 5').",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: {
          type: "integer",
          description:
            "Numero della scena da modificare (1-based, come compare nell'editor).",
        },
        instruction: {
          type: "string",
          description:
            "Come modificare la scena, in linguaggio naturale (es. 'accorcia', 'rendi più teso', 'aggiungi il conflitto').",
        },
      },
      required: ["scene_number", "instruction"],
    },
  },
  {
    name: "propose_treatment_from_narrative",
    description:
      "Scrive il TRATTAMENTO del film derivandolo dal materiale narrativo a monte (scaletta, " +
      "sinossi, soggetto, logline). Applica live il nuovo trattamento al documento e crea automaticamente " +
      "una versione. Usa quando l'utente chiede 'scrivi il trattamento', 'genera il trattamento dalla scaletta' " +
      "o simile. Se il trattamento esiste già lo riscrive seguendo l'istruzione. SOLO per il trattamento, MAI per la sceneggiatura.",
    input_schema: {
      type: "object" as const,
      properties: {
        instruction: {
          type: "string",
          description:
            "Istruzione opzionale per orientare tono/struttura del trattamento (es. 'più dettagliato sull'Atto II', 'tono cupo').",
        },
      },
    },
  },
  {
    name: "generate_screenplay_from_narrative",
    description:
      "Scrive la PRIMA STESURA della SCENEGGIATURA (formato Fountain) derivandola dal materiale narrativo a monte " +
      "(scaletta, trattamento, sinossi, soggetto, logline). La applica LIVE come nuova versione ATTIVA della " +
      "sceneggiatura (l'editor si aggiorna; la versione precedente resta ripristinabile dal pannello Versioni). " +
      "Usa quando l'utente chiede 'scrivi la sceneggiatura', 'scrivimi la prima stesura della sceneggiatura', " +
      "'partendo dal soggetto fammi la sceneggiatura' o simili. NON usare per modificare una sceneggiatura " +
      "esistente — per riscritture strutturali usa propose_screenplay_revision, per una singola scena rewrite_scene.",
    input_schema: {
      type: "object" as const,
      properties: {
        instruction: {
          type: "string",
          description:
            "Istruzione opzionale per orientare tono/struttura della stesura (es. 'taglia i tempi morti', 'dialoghi più asciutti').",
        },
        target_page_count: {
          type: "integer",
          description:
            "Numero approssimativo di pagine desiderate (opzionale).",
        },
      },
    },
  },
] as const;

// ─── Tool block shape (compatible with runGenericToolLoop) ────────────────────

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

// ─── Pure helpers (covered by Vitest) ─────────────────────────────────────────

const docTypeLabel = (type: DocumentType): string => {
  switch (type) {
    case "logline":
      return "logline";
    case "soggetto":
      return "soggetto";
    case "synopsis":
      return "sinossi";
    case "outline":
      return "scaletta";
    case "treatment":
      return "trattamento";
    default:
      return type;
  }
};

/**
 * Auto-generates a label for a propose tool result when the caller didn't
 * provide one. Combines a verb with the document type so the version list
 * stays readable ("draft Cesare · sinossi").
 */
export const buildDraftLabel = (
  docType: DocumentType,
  hint: string | null = null,
): string => {
  const label = docTypeLabel(docType);
  const trimmedHint = (hint ?? "").trim();
  if (trimmedHint.length === 0) {
    return `draft Cesare · ${label}`;
  }
  const safe = trimmedHint.replace(/\s+/g, " ").slice(0, 40);
  return `draft Cesare · ${label} (${safe})`;
};

interface ParsedScalettaScene {
  readonly number: number;
  readonly heading: string;
  readonly description: string;
}

/**
 * Parses a numbered list emitted by the model into a structured list of scenes.
 * Tolerant to several common formats:
 *
 *   "1. INT. CASA — GIORNO\nMarco entra e trova Anna."
 *   "1) INT. CASA - GIORNO: Marco entra…"
 *   "Scena 1 — INT. CASA - GIORNO\nDescrizione…"
 *
 * Lines that do not start a numbered scene are appended to the description of
 * the previous scene. Returns an empty array if no numbered scene is found.
 */
export const parseScalettaList = (raw: string): ParsedScalettaScene[] => {
  if (!raw) return [];
  const lines = raw.split("\n");
  const scenes: { number: number; heading: string; description: string[] }[] =
    [];
  // Number prefix delimiters: . ) : — – (NOT plain '-' to avoid conflict with
  // headings like "Scena 1 - INT. CASA"; we still let " — " split heading/body).
  const headerRe = /^\s*(?:scena\s+)?(\d{1,3})\s*[.):—–]\s*(.+?)\s*$/i;

  // Heading-vs-description delimiter inside the header line. We accept the
  // em/en dash (with surrounding spaces) or a colon followed by space. Plain
  // " - " is intentionally NOT a delimiter because it appears inside screenplay
  // headings ("INT. CASA - GIORNO"). The model is instructed to use " — ".
  const headerSplitRe = /\s+[—–]\s+|:\s+/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = headerRe.exec(trimmed);
    if (match) {
      const num = Number.parseInt(match[1]!, 10);
      if (!Number.isFinite(num) || num <= 0) continue;
      const rest = match[2] ?? "";
      const splitMatch = headerSplitRe.exec(rest);
      let heading: string;
      let description: string;
      if (splitMatch) {
        const splitAt = splitMatch.index;
        heading = rest.slice(0, splitAt).trim();
        description = rest.slice(splitAt + splitMatch[0].length).trim();
      } else {
        heading = rest;
        description = "";
      }
      scenes.push({
        number: num,
        heading,
        description: description ? [description] : [],
      });
    } else if (scenes.length > 0) {
      scenes[scenes.length - 1]!.description.push(trimmed);
    }
  }

  return scenes.map((s) => ({
    number: s.number,
    heading: s.heading,
    description: s.description.join(" ").trim(),
  }));
};

interface OutlineSceneOut {
  id: string;
  heading: string;
  description: string;
  characters: string[];
  pageEstimate: number | null;
  notes: string | null;
}

interface OutlineActOut {
  id: string;
  title: string;
  sequences: {
    id: string;
    title: string;
    scenes: OutlineSceneOut[];
  }[];
}

interface OutlineContentOut {
  acts: OutlineActOut[];
}

/**
 * Converts a parsed scaletta list to the OutlineContent JSON shape consumed by
 * the OutlineEditor. We collapse everything under a single "Atto unico" act +
 * "Sequenza unica" sequence — splitting into proper acts requires structural
 * intent the parser can't reliably infer.
 */
export const scalettaToOutlineContent = (
  scenes: ParsedScalettaScene[],
  idSeed = `cesare-${Date.now()}`,
): OutlineContentOut => {
  if (scenes.length === 0) {
    return { acts: [] };
  }
  const outlineScenes: OutlineSceneOut[] = scenes.map((s, idx) => ({
    id: `${idSeed}-scene-${idx + 1}`,
    heading: s.heading,
    description: s.description,
    characters: [],
    pageEstimate: null,
    notes: null,
  }));
  return {
    acts: [
      {
        id: `${idSeed}-act-1`,
        title: "Atto unico",
        sequences: [
          {
            id: `${idSeed}-seq-1`,
            title: "Sequenza unica",
            scenes: outlineScenes,
          },
        ],
      },
    ],
  };
};

const LOGLINE_HARD_CAP = 200;

/**
 * Trims the model's reply to a single line ≤ LOGLINE_HARD_CAP characters. We
 * favour the first paragraph and strip surrounding quotes that the model
 * sometimes adds.
 */
export const sanitizeLogline = (raw: string): string => {
  const firstPara = raw.split(/\n{2,}/)[0] ?? "";
  const oneLine = firstPara.replace(/\s+/g, " ").trim();
  const noQuotes = oneLine.replace(/^["'«»“”]+|["'«»“”]+$/g, "").trim();
  return noQuotes.slice(0, LOGLINE_HARD_CAP);
};

export type LoglineWriteMode = "write" | "edit";

/**
 * Resolves the effective write/edit mode for `write_logline`. The model may
 * pass an explicit `mode`; otherwise `"auto"` (the default) edits when a
 * non-empty logline already exists and writes a fresh one otherwise. Keeping
 * this as a pure function lets the unit test pin every branch without a DB.
 */
export const resolveLoglineMode = (
  requested: "auto" | "write" | "edit" | undefined,
  existing: string | null,
): LoglineWriteMode => {
  if (requested === "write") return "write";
  if (requested === "edit") return "edit";
  const hasExisting = (existing ?? "").trim().length > 0;
  return hasExisting ? "edit" : "write";
};

// ─── Source content loaders ───────────────────────────────────────────────────

const loadScreenplayContent = (
  db: Db,
  projectId: string,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [row] = await db
        .select({ content: screenplays.content })
        .from(screenplays)
        .where(eq(screenplays.projectId, projectId))
        .limit(1);
      return row?.content ?? "";
    })(),
    (e) =>
      new CesareError(
        `loadScreenplayContent: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface DocumentRowForGen {
  id: string;
  content: string;
  ownerId: string | null;
}

// ─── Upstream narrative chain ─────────────────────────────────────────────────
//
// Bug #3 (write-from-zero) — the post-logline generators used to read ONLY the
// screenplay, so on a from-scratch project (no screenplay yet) they no-op'd and
// the chain dead-ended after the logline. The chain is actually narrative:
//
//   logline → soggetto → sinossi → scaletta → trattamento → sceneggiatura
//
// so each generator must derive from the nearest UPSTREAM narrative document
// (the ones written before it), falling back to the screenplay only as one more
// source. `UPSTREAM_SOURCES` lists, for the document a tool generates, the
// upstream narrative document types to read — ordered nearest-first.

const UPSTREAM_SOURCES: Partial<Record<DocumentType, readonly DocumentType[]>> =
  {
    soggetto: [DocumentTypes.LOGLINE],
    synopsis: [DocumentTypes.SOGGETTO, DocumentTypes.LOGLINE],
    treatment: [
      DocumentTypes.OUTLINE,
      DocumentTypes.SYNOPSIS,
      DocumentTypes.SOGGETTO,
      DocumentTypes.LOGLINE,
    ],
  };

const docTypeLabelUpper = (type: DocumentType): string =>
  docTypeLabel(type).toUpperCase();

/**
 * The narrative material a generator reads, with a human label of where it came
 * from so the prompt can name it ("LOGLINE", "SOGGETTO + SCENEGGIATURA"). This
 * is the single source of truth for "did we have anything upstream to build
 * from" — when `text` is empty the generator must fail loudly, never no-op.
 */
export interface UpstreamSource {
  readonly text: string;
  readonly label: string;
}

interface UpstreamPart {
  readonly label: string;
  readonly content: string;
}

/**
 * Joins the non-empty upstream parts into a single labelled block for the
 * generation prompt. Returns an empty `text` when nothing upstream has content,
 * so the caller can fail loudly instead of generating from thin air. Pure —
 * covered by Vitest.
 */
export const formatUpstreamSource = (
  parts: readonly UpstreamPart[],
): UpstreamSource => {
  const nonEmpty = parts.filter((p) => p.content.trim().length > 0);
  if (nonEmpty.length === 0) return { text: "", label: "" };
  const text = nonEmpty
    .map((p) => `${p.label}:\n---\n${p.content.trim().slice(0, 18_000)}\n---`)
    .join("\n\n");
  return { text, label: nonEmpty.map((p) => p.label).join(" + ") };
};

const loadDocumentForType = (
  db: Db,
  projectId: string,
  type: DocumentType,
): ResultAsync<DocumentRowForGen | null, CesareError> =>
  ResultAsync.fromPromise(
    (async (): Promise<DocumentRowForGen | null> => {
      const [doc] = await db
        .select({
          id: documents.id,
          content: documents.content,
          currentVersionId: documents.currentVersionId,
          createdBy: documents.createdBy,
        })
        .from(documents)
        .where(
          sql`${documents.projectId} = ${projectId} AND ${documents.type} = ${type}`,
        )
        .limit(1);
      if (!doc) return null;
      let content = doc.content;
      if (doc.currentVersionId) {
        const [v] = await db
          .select({ content: documentVersions.content })
          .from(documentVersions)
          .where(eq(documentVersions.id, doc.currentVersionId))
          .limit(1);
        if (v) content = v.content;
      }
      return { id: doc.id, content, ownerId: doc.createdBy };
    })(),
    (e) =>
      new CesareError(
        `loadDocumentForType: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

/**
 * Loads the narrative material a generator should build from: the upstream
 * narrative documents for `targetType` (per `UPSTREAM_SOURCES`, nearest-first)
 * PLUS the screenplay as a final fallback. This is what makes the write-from-zero
 * chain work — on a from-scratch project the soggetto derives from the logline,
 * the sinossi from the soggetto, etc., even though no screenplay exists yet. On a
 * screenplay-backed project the screenplay still contributes, so nothing
 * regresses. Returns an empty `UpstreamSource` only when there is genuinely
 * nothing to build from, so the caller fails loudly instead of no-op'ing.
 */
const loadUpstreamNarrative = (
  db: Db,
  projectId: string,
  targetType: DocumentType,
): ResultAsync<UpstreamSource, CesareError> => {
  const upstreamTypes = UPSTREAM_SOURCES[targetType] ?? [];
  const docLoads = upstreamTypes.map((type) =>
    loadDocumentForType(db, projectId, type).map((doc) => ({
      label: docTypeLabelUpper(type),
      content: doc?.content ?? "",
    })),
  );
  return ResultAsync.combine(docLoads).andThen((narrativeParts) =>
    loadScreenplayContent(db, projectId).map((screenplay) =>
      formatUpstreamSource([
        ...narrativeParts,
        { label: "SCENEGGIATURA", content: screenplay },
      ]),
    ),
  );
};

// The narrative documents the screenplay is built from, nearest-first. The
// screenplay is the leaf of the chain (logline → soggetto → sinossi → scaletta →
// trattamento → SCENEGGIATURA), so its upstream is every preceding narrative
// document — NOT the screenplay itself (it's empty on a first draft, which is the
// only case this generator handles).
const SCREENPLAY_UPSTREAM_TYPES: readonly DocumentType[] = [
  DocumentTypes.OUTLINE,
  DocumentTypes.TREATMENT,
  DocumentTypes.SYNOPSIS,
  DocumentTypes.SOGGETTO,
  DocumentTypes.LOGLINE,
];

const loadUpstreamForScreenplay = (
  db: Db,
  projectId: string,
): ResultAsync<UpstreamSource, CesareError> => {
  const docLoads = SCREENPLAY_UPSTREAM_TYPES.map((type) =>
    loadDocumentForType(db, projectId, type).map((doc) => ({
      label: docTypeLabelUpper(type),
      content: doc?.content ?? "",
    })),
  );
  return ResultAsync.combine(docLoads).map((parts) =>
    formatUpstreamSource(parts),
  );
};

// ─── Draft insertion ──────────────────────────────────────────────────────────
//
// Auto-versioning (create-version-before-apply + rollback-on-error) now lives in
// `auto-version.effect.ts`, where the invariant is made explicit with Effect's
// `acquireRelease` (Spec 48 W-E4). `applyVersionLive` keeps the same
// `ResultAsync<CreatedDraft, CesareError>` boundary, so every handler below is
// untouched. `CreatedDraft` (incl. the Spec 47d `diffSegments`) is re-exported
// from that module.

// ─── Generators ───────────────────────────────────────────────────────────────

const LOGLINE_SYSTEM = `Sei Cesare, editor narrativo italiano. Stai leggendo una sceneggiatura completa e devi scrivere UNA logline efficace.

REGOLE:
- Massimo 200 caratteri, una sola frase.
- Struttura "protagonista + obiettivo + ostacolo".
- Italiano, registro asciutto e specifico.
- NIENTE virgolette di apertura/chiusura, NIENTE commenti, NIENTE preamboli.
- Output: SOLO la logline, su una sola riga.`;

const LOGLINE_WRITE_SYSTEM = `Sei Cesare, editor narrativo italiano. Devi scrivere UNA logline efficace a partire dall'istruzione dell'autore.

REGOLE:
- Massimo 200 caratteri, una sola frase.
- Struttura "protagonista + obiettivo + ostacolo".
- Italiano, registro asciutto e specifico.
- Usa SOLO ciò che è nell'istruzione: non inventare titoli o dettagli non richiesti.
- NIENTE virgolette di apertura/chiusura, NIENTE commenti, NIENTE preamboli.
- Output: SOLO la logline, su una sola riga.`;

const LOGLINE_EDIT_SYSTEM = `Sei Cesare, editor narrativo italiano. Devi RISCRIVERE una logline esistente seguendo l'istruzione dell'autore.

REGOLE:
- Massimo 200 caratteri, una sola frase.
- Applica fedelmente l'istruzione (es. più corta, più tesa, cambia protagonista) mantenendo il nucleo della logline a meno che l'istruzione non chieda di cambiarlo.
- La tua versione DEVE essere diversa dalla logline attuale.
- Italiano, registro asciutto e specifico.
- NIENTE virgolette di apertura/chiusura, NIENTE commenti, NIENTE preamboli.
- Output: SOLO la logline, su una sola riga.`;

const SYNOPSIS_SYSTEM = `Sei Cesare, editor narrativo italiano. Stai leggendo una sceneggiatura completa e devi scrivere una sinossi cinematografica.

REGOLE:
- 2-3 paragrafi, ~400 parole totali, italiano.
- Presenta protagonista, antagonista, conflitto, finale esplicito.
- Tono adatto a produttori e organismi di finanziamento.
- NIENTE titoli, NIENTE elenco puntato, NIENTE meta-commenti.
- Output: SOLO il testo della sinossi.`;

const SOGGETTO_SYSTEM = `Sei Cesare, editor narrativo italiano. Stai riscrivendo il SOGGETTO di un film seguendo una direzione precisa.

REGOLE:
- Conserva premessa, protagonista, antagonista, finale principale.
- Applica fedelmente l'istruzione ricevuta (tono, focus, struttura).
- Italiano, prosa narrativa, paragrafi separati da riga vuota.
- NIENTE titoli, NIENTE meta-commenti, NIENTE intestazioni.
- Output: SOLO il nuovo soggetto.`;

const SCALETTA_SYSTEM = `Sei Cesare, editor narrativo italiano. Stai costruendo la SCALETTA (lista scene) di un film a partire dal soggetto.

REGOLE:
- Una scena per riga, numerata "1. ", "2. ", …
- Formato: "<numero>. <heading scena, es. INT. CASA - GIORNO> — <descrizione 1-2 frasi>".
- Italiano, headings in maiuscolo, descrizioni concise.
- Nessun preambolo, nessuna chiusura, solo la lista numerata.`;

const TREATMENT_SYSTEM = `Sei Cesare, editor narrativo italiano. Stai scrivendo il TRATTAMENTO di un film a partire dal materiale narrativo a monte (scaletta, sinossi, soggetto, logline).

REGOLE:
- Prosa narrativa al presente, italiano, in scene/sequenze nell'ordine della storia.
- Racconta l'azione visibile scena per scena, senza dialoghi formattati.
- Mantieni protagonista, antagonista, conflitto e finale coerenti col materiale a monte.
- Paragrafi separati da riga vuota; nessun elenco numerato, nessun heading di scena tecnico.
- NIENTE titoli, NIENTE meta-commenti, NIENTE preamboli.
- Output: SOLO il testo del trattamento.`;

const SCREENPLAY_FROM_NARRATIVE_SYSTEM = `Sei Cesare, sceneggiatore italiano. Stai scrivendo la PRIMA STESURA della SCENEGGIATURA di un film, in formato Fountain, a partire dal materiale narrativo a monte (scaletta, trattamento, sinossi, soggetto, logline).

Output: SOLO il testo Fountain della sceneggiatura, senza meta-commenti, senza intestazioni esterne, senza markdown.

Formato Fountain (rispetta ESATTAMENTE la struttura — ogni elemento è una riga separata):
- SLUGLINE (scena): "INT." o "EXT." (o "INT./EXT.") + LUOGO + " - " + MOMENTO, TUTTO MAIUSCOLO, a inizio riga. Es: "INT. CUCINA - NOTTE".
- AZIONE: prosa normale (maiuscole/minuscole NORMALI), a inizio riga, un paragrafo per riga, separati da una riga vuota.
- PERSONAGGIO (cue): SOLO il nome, TUTTO MAIUSCOLO, su una riga propria, preceduto da una riga vuota. Es: "MARCO" oppure "MARCO (V.O.)". È solo il nome di chi parla — MAI la battuta.
- DIALOGO: la battuta del personaggio, in maiuscole/minuscole NORMALI (NON tutto maiuscolo), sulla riga SUBITO DOPO il nome del personaggio. Es: dopo "MARCO" la riga "Luca, ascolta. Non interrompermi."
- PARENTETICA: "(testo)" su una riga propria tra personaggio e dialogo.
- TRANSIZIONE: a inizio riga, TUTTO MAIUSCOLO, che termina con "TO:" oppure le forme note "FADE IN:", "FADE OUT.", "FADE TO BLACK.", "DISSOLVENZA.", "STACCO.". Es: "FADE TO BLACK." è una TRANSIZIONE, non azione.

DISTINZIONE CRITICA (sbagliarla rovina la sceneggiatura):
- Il PERSONAGGIO è SOLO il nome in maiuscolo; la sua battuta (DIALOGO) va sulla riga successiva in minuscolo. NON scrivere la battuta in maiuscolo e NON metterla sulla stessa riga del nome. SBAGLIATO: "GIULIO E allora?" (nome e battuta sulla stessa riga). GIUSTO: "GIULIO" su una riga, poi "E allora?" sulla riga sotto.
- Quando l'azione nomina un personaggio, scrivilo in maiuscola/minuscola NORMALE dentro la prosa (es. "Filippo attraversa la sala") — il nome TUTTO MAIUSCOLO a inizio riga è SEMPRE e SOLO un PERSONAGGIO che sta per parlare.
- "FADE TO BLACK." / "DISSOLVENZA." / "STACCO." sono TRANSIZIONI (riga a sé, maiuscolo), NON azione.

Esempio corretto:
INT. CASA DI MARCO - NOTTE

Marco rilegge il copione alla luce di una lampada.

MARCO (V.O.)
Non sei più qui per dirmi se ho sbagliato tutto.

FADE TO BLACK.

REGOLE:
- Copri l'intera storia del materiale a monte, scena per scena, nell'ordine narrativo.
- Scrivi dialoghi reali sotto ogni personaggio — NON limitarti a descrivere l'azione.
- Ogni paragrafo di azione su UNA SOLA RIGA: NON wrappare a 50/60/80 caratteri, NON spezzare frasi a metà, usa la riga vuota SOLO tra paragrafi narrativi distinti.
- Mantieni protagonista, antagonista, conflitto e finale coerenti col materiale a monte.
- Italiano. NIENTE titoli di sezione, NIENTE preamboli, NIENTE commenti.`;

const MOCK_OUTPUTS: Record<string, string> = {
  "cesare.proposeLogline":
    "Un giovane regista torna nel paese d'origine per girare il film che lo ossessiona da anni, ma scopre che il suo passato non vuole essere raccontato.",
  "cesare.writeLogline":
    "Un detective insonne insegue un killer che lascia indizi solo a chi non dorme, e per fermarlo deve restare sveglio più a lungo della propria sanità mentale.",
  "cesare.editLogline":
    "Un detective insonne dà la caccia a un killer in una città che non dorme mai, sapendo che il primo a chiudere gli occhi sarà la prossima vittima.",
  "cesare.proposeSynopsis": `Quando Marco torna a Falerone per girare il suo primo lungometraggio, il paese accoglie la troupe con una freddezza inattesa. La protagonista della sua storia — la madre, morta vent'anni prima — è ancora un nervo scoperto per chi l'ha conosciuta, e ogni inquadratura sembra disturbare qualcosa.

Tea, l'attrice scelta per il ruolo, intuisce che Marco non sta raccontando un personaggio ma sé stesso. Tra lei e il regista si crea un'intimità che cresce in parallelo al film: ogni nuova scena costringe Marco a confessare un dettaglio in più. L'antagonista non è una persona ma un silenzio collettivo che il paese ha eretto per proteggersi.

Il film viene completato, ma la versione che vediamo non è quella che Marco aveva scritto: è la verità che Tea, con il suo sguardo, gli ha permesso di girare. Marco sceglie di proiettarla in piazza, accettando il rischio.`,
  "cesare.proposeSoggettoV2": `Marco torna a Falerone per girare un film su sua madre. La troupe arriva in un paese che non vuole essere filmato.

Tea, la protagonista, capisce subito che il copione è una bugia. Lo costringe a riscrivere ogni scena prima di girarla. Marco resiste, poi cede.

Il film finito è diverso da quello immaginato. Marco lo proietta in piazza, davanti a chi gli aveva chiesto di tacere.`,
  "cesare.proposeScaletta": `1. INT. CASA DI MARCO - NOTTE — Marco rilegge il copione e segna gli appunti della madre.
2. EXT. FALERONE - PIAZZA - GIORNO — La troupe arriva. La piazza è semivuota.
3. INT. BAR DEL CORSO - GIORNO — Marco riconosce un volto della sua infanzia.
4. EXT. CIMITERO - GIORNO — Marco visita la tomba della madre con Tea.
5. INT. SET - SCENA UNO - GIORNO — Prima ripresa. Tea non rispetta la battuta.
6. INT. RISTORANTE - SERA — Marco e Tea litigano sul senso della scena.
7. EXT. CAMPAGNA - GIORNO — Tea cammina sola. Marco la riprende di nascosto.
8. INT. SET - SCENA SETTE - NOTTE — La scena chiave. Marco improvvisa.
9. EXT. PIAZZA - NOTTE — Proiezione finale. Il paese guarda.
10. INT. CASA DI MARCO - ALBA — Marco scrive una lettera alla madre.`,
  "cesare.proposeTreatment": `Marco torna a Falerone una notte di fine estate. Nella casa dell'infanzia rilegge il copione del film che vuole girare su sua madre, e gli appunti ai margini lo riportano a un dolore mai chiuso.

La mattina dopo la troupe arriva in una piazza semivuota. Il paese osserva la macchina da presa con diffidenza: nessuno qui vuole essere filmato. Marco riconosce un volto della sua infanzia al bar del corso, e capisce che ogni inquadratura riaprirà una ferita collettiva.

Sul set, Tea — l'attrice scelta per interpretare la madre — non rispetta la battuta. Lo costringe a riscrivere ogni scena prima di girarla. Marco resiste, poi cede: il film che stava immaginando non è quello che la verità gli chiede di girare.

La notte della scena chiave, Marco improvvisa. Davanti alla troupe e a un paese che gli aveva chiesto di tacere, proietta in piazza la versione che Tea gli ha permesso di trovare. All'alba scrive una lettera alla madre.`,
  "cesare.generateScreenplay": `INT. CASA DI MARCO - NOTTE

Marco rilegge il copione alla luce di una lampada. Sui margini, gli appunti della madre.

      MARCO
          Non sei più qui per dirmi se ho sbagliato tutto.

EXT. FALERONE - PIAZZA - GIORNO

La troupe scarica i furgoni. La piazza è semivuota. Qualche tenda si chiude.

      TEA
          Questo posto non vuole essere filmato.

      MARCO
          Lo so. È esattamente per questo che lo filmo.

FADE TO BLACK.`,
};

// Monotonic counter that keeps each MOCK_AI document generation distinct, so the
// applyVersionLive duplicate guard never trips when an E2E suite exercises the
// same project repeatedly (e.g. A6 + A7 both applying propose_soggetto_v2).
// Mock-only; never used on the real generation path.
let mockGenerationNonce = 0;

// #103 — when `onDelta` is supplied, the generation streams and forwards each
// text chunk live (so scenes appear progressively in the tracer instead of after
// a ~40s silent block). When absent, the blocking callHaiku path is used,
// identical to before. Only the whole-document generators (scaletta / treatment
// / screenplay) pass it; short one-shots (logline, single scene) leave it
// undefined and gain nothing from streaming.
const runGeneration = (
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  operation: string,
  onDelta?: (text: string) => void,
  // #103 — the outer turn's cancel signal, forwarded to the streaming path so a
  // cancelled turn tears the nested generation down instead of leaking a billed
  // model call. Only meaningful alongside onDelta (the streaming path).
  abortSignal?: AbortSignal,
): ResultAsync<string, CesareError> => {
  // Mock-mode escape hatch: short-circuit Sonnet calls when MOCK_AI=true or the
  // API key is missing. Keeps Vitest + Playwright deterministic and free.
  if (process.env["MOCK_AI"] === "true" || !process.env["ANTHROPIC_API_KEY"]) {
    const text = MOCK_OUTPUTS[operation] ?? "Bozza generata da Cesare (mock).";
    // Any document-generation op can be exercised repeatedly across E2E cases
    // against the same project (e.g. show-changes [A6] and universal-dispatch
    // [A7] both apply `propose_soggetto_v2`). `applyVersionLive` rejects content
    // identical to an existing version (no-op guard), so a fixed mock string
    // would make the 2nd apply fail. Append a tiny unique suffix so every mock
    // generation is a real, distinct version. Logline stays within its hard cap.
    mockGenerationNonce += 1;
    const suffix = ` (#${Date.now().toString(36).slice(-4)}-${mockGenerationNonce})`;
    const isLogline =
      operation === "cesare.writeLogline" || operation === "cesare.editLogline";
    if (isLogline) {
      return okAsync(
        `${text.slice(0, LOGLINE_HARD_CAP - suffix.length)}${suffix}`,
      );
    }
    if (onDelta) onDelta(`${text}${suffix}`);
    return okAsync(`${text}${suffix}`);
  }
  if (onDelta) {
    return streamGeneration(
      {
        system: systemPrompt,
        user: userPrompt,
        model: QUALITY_TIER_MODEL,
        maxTokens,
      },
      operation,
      onDelta,
      abortSignal,
    )
      .mapErr((e) => new CesareError(`${operation} failed: ${e.message}`))
      .andThen((text) =>
        text.trim().length > 0
          ? okAsync(repairMojibake(text))
          : errAsync(new CesareError(`${operation}: model returned no text`)),
      );
  }
  return callHaiku(
    {
      system: systemPrompt,
      fewShot: [],
      user: userPrompt,
      model: QUALITY_TIER_MODEL,
      maxTokens,
    },
    operation,
  )
    .mapErr((e) => new CesareError(`${operation} failed: ${e.message}`))
    .andThen((res) => {
      const text = extractText(res.content);
      return text
        ? okAsync(repairMojibake(text))
        : errAsync(new CesareError(`${operation}: model returned no text`));
    });
};

interface ProposeInput {
  instruction?: string;
  label?: string;
  target_scene_count?: number;
  target_page_count?: number;
  scene_number?: number;
  mode?: "auto" | "write" | "edit";
}

const handleProposeLogline = (
  input: ProposeInput,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
  sessionId: string | null = null,
  userInstruction: string | null = null,
): ResultAsync<CommitOutcome, CesareError> =>
  loadScreenplayContent(db, projectId).andThen((screenplay) => {
    if (screenplay.trim().length === 0) {
      return errAsync(
        new CesareError(
          "La sceneggiatura del progetto è vuota: aggiungi del testo prima di generare la logline.",
        ),
      );
    }
    const user = `${input.instruction ? `Istruzione: ${input.instruction}\n\n` : ""}Sceneggiatura:\n---\n${screenplay.slice(0, 18_000)}\n---`;
    return runGeneration(LOGLINE_SYSTEM, user, 200, "cesare.proposeLogline")
      .map(sanitizeLogline)
      .andThen((logline) =>
        loadDocumentForType(db, projectId, DocumentTypes.LOGLINE).andThen(
          (doc) => {
            if (!doc) {
              return errAsync(
                new CesareError(
                  "Documento logline non trovato per il progetto.",
                ),
              );
            }
            const creator = doc.ownerId ?? userIdFallback;
            if (!creator) {
              return errAsync(
                new CesareError(
                  "Impossibile determinare l'autore della draft: documento senza createdBy.",
                ),
              );
            }
            return commitOrAsk(
              db,
              doc.id,
              DocumentTypes.LOGLINE,
              creator,
              doc.content,
              logline,
              buildDraftLabel(DocumentTypes.LOGLINE, input.instruction ?? null),
              commitOptions(sessionId, input.instruction, userInstruction),
            );
          },
        ),
      );
  });

/**
 * Writes or edits the logline document from a FREE natural-language instruction,
 * without needing the screenplay. Mode resolution (write vs edit) is decided by
 * `resolveLoglineMode` against the document's current content. Both paths apply
 * LIVE via `applyVersionLive` (auto-version first), so the agentic-edit pattern
 * is identical to the screenplay-extraction path — no per-feature variant.
 */
const handleWriteLogline = (
  input: ProposeInput,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
  sessionId: string | null = null,
  userInstruction: string | null = null,
): ResultAsync<CommitOutcome, CesareError> => {
  const instruction = (input.instruction ?? "").trim();
  if (instruction.length === 0) {
    return errAsync(
      new CesareError(
        "write_logline richiede un'istruzione: descrivi la logline da scrivere o la modifica da applicare.",
      ),
    );
  }
  return loadDocumentForType(db, projectId, DocumentTypes.LOGLINE).andThen(
    (doc) => {
      if (!doc) {
        return errAsync(
          new CesareError("Documento logline non trovato per il progetto."),
        );
      }
      const existing = doc.content.trim();
      const mode = resolveLoglineMode(input.mode, existing);
      if (mode === "edit" && existing.length === 0) {
        return errAsync(
          new CesareError(
            "Non c'è ancora una logline da modificare. Dammi una premessa e la scrivo da zero.",
          ),
        );
      }
      const systemPrompt =
        mode === "edit" ? LOGLINE_EDIT_SYSTEM : LOGLINE_WRITE_SYSTEM;
      const operation =
        mode === "edit" ? "cesare.editLogline" : "cesare.writeLogline";
      const user =
        mode === "edit"
          ? `Istruzione: ${instruction}\n\nLogline attuale (NON ritornarla identica):\n---\n${existing}\n---`
          : `Istruzione: ${instruction}\n\nScrivi la logline.`;
      return runGeneration(systemPrompt, user, 200, operation)
        .map(sanitizeLogline)
        .andThen((logline) => {
          if (logline.length === 0) {
            return errAsync(
              new CesareError(
                "Il modello ha restituito una logline vuota. Riformula l'istruzione.",
              ),
            );
          }
          const creator = doc.ownerId ?? userIdFallback;
          if (!creator) {
            return errAsync(
              new CesareError(
                "Impossibile determinare l'autore della draft: documento senza createdBy.",
              ),
            );
          }
          return commitOrAsk(
            db,
            doc.id,
            DocumentTypes.LOGLINE,
            creator,
            doc.content,
            logline,
            buildDraftLabel(DocumentTypes.LOGLINE, instruction),
            commitOptions(sessionId, instruction, userInstruction),
          );
        });
    },
  );
};

const handleProposeSynopsis = (
  input: ProposeInput,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
  sessionId: string | null = null,
  userInstruction: string | null = null,
): ResultAsync<CommitOutcome, CesareError> =>
  loadUpstreamNarrative(db, projectId, DocumentTypes.SYNOPSIS).andThen(
    (upstream) => {
      if (upstream.text.length === 0) {
        return errAsync(
          new CesareError(
            "Non c'è ancora materiale da cui scrivere la sinossi: scrivi prima la logline o il soggetto (o aggiungi del testo alla sceneggiatura).",
          ),
        );
      }
      const user = `${input.instruction ? `Istruzione: ${input.instruction}\n\n` : ""}${upstream.text}`;
      return runGeneration(
        SYNOPSIS_SYSTEM,
        user,
        1200,
        "cesare.proposeSynopsis",
      )
        .map((s) => s.trim())
        .andThen((synopsis) =>
          loadDocumentForType(db, projectId, DocumentTypes.SYNOPSIS).andThen(
            (doc) => {
              if (!doc) {
                return errAsync(
                  new CesareError(
                    "Documento sinossi non trovato per il progetto.",
                  ),
                );
              }
              const creator = doc.ownerId ?? userIdFallback;
              if (!creator) {
                return errAsync(
                  new CesareError(
                    "Impossibile determinare l'autore della draft: documento senza createdBy.",
                  ),
                );
              }
              return commitOrAsk(
                db,
                doc.id,
                DocumentTypes.SYNOPSIS,
                creator,
                doc.content,
                synopsis,
                buildDraftLabel(
                  DocumentTypes.SYNOPSIS,
                  input.instruction ?? null,
                ),
                commitOptions(sessionId, input.instruction, userInstruction),
              );
            },
          ),
        );
    },
  );

const handleProposeSoggettoV2 = (
  input: ProposeInput,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
  sessionId: string | null = null,
  userInstruction: string | null = null,
): ResultAsync<CommitOutcome, CesareError> => {
  if (!input.instruction || !input.label) {
    return errAsync(
      new CesareError(
        "propose_soggetto_v2 richiede sia `instruction` che `label`.",
      ),
    );
  }
  const instruction = input.instruction;
  const label = input.label;
  return ResultAsync.combine([
    loadDocumentForType(db, projectId, DocumentTypes.SOGGETTO),
    loadUpstreamNarrative(db, projectId, DocumentTypes.SOGGETTO),
  ]).andThen(([doc, upstream]) => {
    if (!doc) {
      return errAsync(
        new CesareError("Documento soggetto non trovato per il progetto."),
      );
    }
    const existing = doc.content.trim();
    // Bug #3 — when the soggetto is still empty, WRITE it from the upstream
    // narrative (the logline) instead of no-op'ing. Only when there is genuinely
    // nothing upstream either do we ask the user to write a soggetto first.
    if (existing.length === 0 && upstream.text.length === 0) {
      return errAsync(
        new CesareError(
          "Non c'è ancora materiale da cui scrivere il soggetto: scrivi prima la logline (o aggiungi del testo alla sceneggiatura).",
        ),
      );
    }
    const user =
      existing.length === 0
        ? `Stai SCRIVENDO il soggetto da zero a partire dal materiale a monte, seguendo questa istruzione: ${instruction}.

Espandi il materiale in un soggetto narrativo completo (premessa, protagonista, antagonista, conflitto, svolgimento, finale). Italiano, prosa, paragrafi separati da riga vuota.

Materiale a monte:
${upstream.text}`
        : `Stai riscrivendo IL SOGGETTO seguendo questa istruzione: ${instruction}.

REGOLA TASSATIVA: la tua versione DEVE essere diversa dal soggetto attuale. Non limitarti a riformattarlo. Cambia tono/struttura/dettagli secondo l'istruzione. Se non hai abbastanza informazione per cambiare nulla, espandi i dettagli sensoriali e drammatici delle scene esistenti.

Soggetto attuale (NON ritornarlo identico):
---
${doc.content.slice(0, 18_000)}
---`;
    return runGeneration(
      SOGGETTO_SYSTEM,
      user,
      2000,
      "cesare.proposeSoggettoV2",
    )
      .map((s) => s.trim())
      .andThen((next) => {
        // Guard against the model returning the input verbatim — happened
        // when the instruction is vague and Sonnet falls back to "looks fine
        // already". A draft identical to v1 is worse than no draft. (Only
        // meaningful in rewrite mode; on a first write `existing` is empty.)
        if (existing.length > 0 && next === existing) {
          return errAsync(
            new CesareError(
              "Il modello ha restituito un soggetto identico all'attuale. Riformula la richiesta con un'istruzione più specifica (es. 'più asciutto', 'tono noir', 'taglia la sequenza finale').",
            ),
          );
        }
        const creator = doc.ownerId ?? userIdFallback;
        if (!creator) {
          return errAsync(
            new CesareError(
              "Impossibile determinare l'autore della draft: documento senza createdBy.",
            ),
          );
        }
        return commitOrAsk(
          db,
          doc.id,
          DocumentTypes.SOGGETTO,
          creator,
          doc.content,
          next,
          label.slice(0, 80),
          commitOptions(sessionId, instruction, userInstruction),
        );
      });
  });
};

// A scaletta's natural length follows the project FORMAT. Before this, the
// default was a hardcoded 40 regardless of format — so a CORTO (short) got a
// 40-scene feature-length outline (BUG: measured live on "Non fa ridere", a
// short, generating 40 scenes). These are sensible mid-range defaults used only
// when the model didn't pass an explicit target_scene_count; the model can still
// override per request, and the hard [8,120] clamp still applies below.
type ProjectFormat = "feature" | "short" | "series_episode" | "pilot";

export const defaultSceneCountForFormat = (
  format: ProjectFormat | string | null,
): number => {
  switch (format) {
    case "short":
      return 14; // ~10-18 scenes for a short
    case "series_episode":
    case "pilot":
      return 28; // a TV episode sits between a short and a feature
    case "feature":
    default:
      return 45; // full-length
  }
};

const handleProposeScalettaFromSoggetto = (
  input: ProposeInput,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
  sessionId: string | null = null,
  onDelta?: (text: string) => void,
  abortSignal?: AbortSignal,
): ResultAsync<CreatedDraft, CesareError> =>
  loadDocumentForType(db, projectId, DocumentTypes.SOGGETTO).andThen((doc) => {
    if (!doc || doc.content.trim().length === 0) {
      return errAsync(
        new CesareError(
          "Soggetto vuoto o mancante: scrivilo prima di generare la scaletta.",
        ),
      );
    }
    // Load the project format so the default scene count matches the film
    // length. A missing project row falls back to the feature default.
    return ResultAsync.fromPromise(
      db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        columns: { format: true },
      }),
      (e) =>
        new CesareError(
          `Failed to load project format: ${
            e instanceof Error ? e.message : String(e)
          }`,
        ),
    ).andThen((project) => {
      const formatDefault = defaultSceneCountForFormat(project?.format ?? null);
      const targetCount = Number.isFinite(input.target_scene_count)
        ? Math.max(8, Math.min(120, Number(input.target_scene_count)))
        : formatDefault;
      const user = `Numero di scene desiderate: circa ${targetCount}.\n\nSoggetto:\n---\n${doc.content.slice(0, 18_000)}\n---`;
      return runGeneration(
        SCALETTA_SYSTEM,
        user,
        3000,
        "cesare.proposeScaletta",
        onDelta,
        abortSignal,
      )
        .map((raw) => {
          const parsed = parseScalettaList(raw);
          const outline = scalettaToOutlineContent(parsed);
          return JSON.stringify(outline);
        })
        .andThen((content) =>
          loadDocumentForType(db, projectId, DocumentTypes.OUTLINE).andThen(
            (outlineDoc) => {
              if (!outlineDoc) {
                return errAsync(
                  new CesareError(
                    "Documento scaletta non trovato per il progetto.",
                  ),
                );
              }
              const creator = outlineDoc.ownerId ?? userIdFallback;
              if (!creator) {
                return errAsync(
                  new CesareError(
                    "Impossibile determinare l'autore della draft: documento senza createdBy.",
                  ),
                );
              }
              // A derive-from-soggetto regeneration is an explicit generation act,
              // not an iterative edit, so it applies directly (overwrite/checkpoint
              // as resolved) and never triggers the large-edit ask.
              return applyVersionLive(
                db,
                outlineDoc.id,
                DocumentTypes.OUTLINE,
                creator,
                content,
                buildDraftLabel(DocumentTypes.OUTLINE, "da soggetto"),
                commitOptions(sessionId, null),
              );
            },
          ),
        );
    });
  });

// ─── Scoped outline scene edit (#102) ────────────────────────────────────────
// The outline is JSON (acts[].sequences[].scenes[]), so the markdown-based
// surgical tools (apply_text_edit / compress_section) can't target one scene —
// which is why a scoped ask like "accorcia la scena 1" used to fall through to
// the whole-document regenerator. These helpers give the model a real
// single-scene patch path: rewrite ONE scene's description in place and leave
// every other scene byte-identical.

interface FlatOutlineScene {
  readonly scene: OutlineScene;
  readonly actIndex: number;
  readonly seqIndex: number;
  readonly sceneIndex: number;
}

// Scenes in document order, so scene_number N (1-based) maps to the Nth scene
// the way the user counts them in the editor.
export const flattenOutlineScenes = (
  outline: OutlineContent,
): FlatOutlineScene[] => {
  const flat: FlatOutlineScene[] = [];
  outline.acts.forEach((act, actIndex) =>
    act.sequences.forEach((seq, seqIndex) =>
      seq.scenes.forEach((scene, sceneIndex) =>
        flat.push({ scene, actIndex, seqIndex, sceneIndex }),
      ),
    ),
  );
  return flat;
};

// Returns a NEW outline with scene `sceneNumber` (1-based) patched. Every other
// scene, and all ids/structure, are preserved. Out-of-range → null (caller
// reports a clear error instead of silently touching the wrong scene).
export const patchOutlineSceneAt = (
  outline: OutlineContent,
  sceneNumber: number,
  patch: { heading?: string; description?: string },
): OutlineContent | null => {
  const flat = flattenOutlineScenes(outline);
  const target = flat[sceneNumber - 1];
  if (!target) return null;
  return {
    acts: outline.acts.map((act, ai) =>
      ai !== target.actIndex
        ? act
        : {
            ...act,
            sequences: act.sequences.map((seq, si) =>
              si !== target.seqIndex
                ? seq
                : {
                    ...seq,
                    scenes: seq.scenes.map((scene, sci) =>
                      sci !== target.sceneIndex
                        ? scene
                        : {
                            ...scene,
                            ...(patch.heading !== undefined
                              ? { heading: patch.heading }
                              : {}),
                            ...(patch.description !== undefined
                              ? { description: patch.description }
                              : {}),
                          },
                    ),
                  },
            ),
          },
    ),
  };
};

const EDIT_SCENE_SYSTEM = `Sei Cesare, editor narrativo italiano. Riscrivi la DESCRIZIONE di UNA singola scena di scaletta seguendo l'istruzione dell'utente.

REGOLE:
- Restituisci SOLO la nuova descrizione della scena, 1-2 frasi, in italiano.
- Nessun numero di scena, nessun heading, nessun preambolo, nessuna virgoletta.
- Mantieni i fatti della scena a meno che l'istruzione non chieda esplicitamente di cambiarli.`;

// Edits ONE outline scene's description in place. The nested generation prompt
// is tiny (one scene, not the whole document), so this is fast and cheap — the
// scoped counterpart to propose_scaletta_from_soggetto's full regeneration.
const handleEditOutlineScene = (
  input: ProposeInput & { scene_number?: number },
  db: Db,
  projectId: string,
  userIdFallback: string | null,
  sessionId: string | null = null,
): ResultAsync<CreatedDraft, CesareError> => {
  const sceneNumber = Number(input.scene_number);
  if (!Number.isFinite(sceneNumber) || sceneNumber < 1) {
    return errAsync(
      new CesareError(
        "Numero di scena mancante o non valido: indica quale scena modificare (es. 'la scena 1').",
      ),
    );
  }
  const instruction = (input.instruction ?? "").trim();
  if (instruction.length === 0) {
    return errAsync(
      new CesareError(
        "Istruzione mancante: dimmi come modificare la scena (es. 'accorcia', 'rendi più teso').",
      ),
    );
  }

  return loadDocumentForType(db, projectId, DocumentTypes.OUTLINE).andThen(
    (outlineDoc) => {
      if (!outlineDoc) {
        return errAsync(
          new CesareError("Documento scaletta non trovato per il progetto."),
        );
      }
      const outline = parseOutline(outlineDoc.content);
      const flat = flattenOutlineScenes(outline);
      const target = flat[sceneNumber - 1];
      if (!target) {
        return errAsync(
          new CesareError(
            `La scaletta ha ${flat.length} scene: la scena ${sceneNumber} non esiste.`,
          ),
        );
      }
      const user = `Istruzione: ${instruction}\n\nScena ${sceneNumber} — ${target.scene.heading}\nDescrizione attuale:\n${target.scene.description}`;
      return runGeneration(
        EDIT_SCENE_SYSTEM,
        user,
        400,
        "cesare.editOutlineScene",
      ).andThen((newDescription) => {
        const patched = patchOutlineSceneAt(outline, sceneNumber, {
          description: newDescription.trim(),
        });
        if (!patched) {
          return errAsync(
            new CesareError(
              `Impossibile applicare la modifica alla scena ${sceneNumber}.`,
            ),
          );
        }
        const creator = outlineDoc.ownerId ?? userIdFallback;
        if (!creator) {
          return errAsync(
            new CesareError(
              "Impossibile determinare l'autore della draft: documento senza createdBy.",
            ),
          );
        }
        return applyVersionLive(
          db,
          outlineDoc.id,
          DocumentTypes.OUTLINE,
          creator,
          serializeOutline(patched),
          buildDraftLabel(DocumentTypes.OUTLINE, `scena ${sceneNumber}`),
          commitOptions(sessionId, instruction),
        );
      });
    },
  );
};

/**
 * Writes (or rewrites) the treatment from the upstream NARRATIVE chain
 * (scaletta → sinossi → soggetto → logline, nearest-first), with the screenplay
 * as a final fallback. This is the F-A2 fix: the "Scrivi il trattamento dalla
 * scaletta" next-step chip used to dead-end because no treatment generator
 * existed. Like the other generators it auto-versions before applying live and
 * fails loudly when there is genuinely nothing upstream to build from, so the
 * honest card never reports a fabricated success.
 */
const handleProposeTreatment = (
  input: ProposeInput,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
  sessionId: string | null = null,
  userInstruction: string | null = null,
  onDelta?: (text: string) => void,
  abortSignal?: AbortSignal,
): ResultAsync<CommitOutcome, CesareError> =>
  ResultAsync.combine([
    loadDocumentForType(db, projectId, DocumentTypes.TREATMENT),
    loadUpstreamNarrative(db, projectId, DocumentTypes.TREATMENT),
  ]).andThen(([doc, upstream]) => {
    if (!doc) {
      return errAsync(
        new CesareError("Documento trattamento non trovato per il progetto."),
      );
    }
    if (upstream.text.length === 0) {
      return errAsync(
        new CesareError(
          "Non c'è ancora materiale da cui scrivere il trattamento: scrivi prima la scaletta, la sinossi o il soggetto (o aggiungi del testo alla sceneggiatura).",
        ),
      );
    }
    const existing = doc.content.trim();
    const instructionLine = input.instruction
      ? `Istruzione: ${input.instruction}\n\n`
      : "";
    const existingBlock =
      existing.length > 0
        ? `\n\nTrattamento attuale (riscrivilo seguendo l'istruzione, NON ritornarlo identico):\n---\n${existing.slice(0, 18_000)}\n---`
        : "";
    const user = `${instructionLine}Materiale a monte:\n${upstream.text}${existingBlock}`;
    return runGeneration(
      TREATMENT_SYSTEM,
      user,
      3000,
      "cesare.proposeTreatment",
      onDelta,
      abortSignal,
    )
      .map((s) => s.trim())
      .andThen((treatment) => {
        if (treatment.length === 0) {
          return errAsync(
            new CesareError(
              "Il modello ha restituito un trattamento vuoto. Riformula l'istruzione.",
            ),
          );
        }
        const creator = doc.ownerId ?? userIdFallback;
        if (!creator) {
          return errAsync(
            new CesareError(
              "Impossibile determinare l'autore della draft: documento senza createdBy.",
            ),
          );
        }
        return commitOrAsk(
          db,
          doc.id,
          DocumentTypes.TREATMENT,
          creator,
          doc.content,
          treatment,
          buildDraftLabel(DocumentTypes.TREATMENT, input.instruction ?? null),
          commitOptions(sessionId, input.instruction, userInstruction),
        );
      });
  });

// ─── Screenplay generation (from-narrative, first draft) ───────────────────────
//
// Spec 75 / BUG-N67. The screenplay is the leaf of the narrative chain but, unlike
// the upstream documents, it lives in `screenplays`/`screenplay_versions` (Fountain
// + CRDT), not in `documents`. So we generate Fountain from the upstream narrative
// and apply it LIVE as the new ACTIVE screenplay version via `importAsActiveVersionTx`
// (the proven Spec 71/72 path: insert version row, server-seed the CRDT snapshot so
// the editor renders without a first-client race, repoint current, sync scenes, carry
// breakdown forward). The prior active version is left intact and restorable.

interface ScreenplayRowForGen {
  id: string;
  currentVersionId: string | null;
  createdBy: string;
  content: string;
}

const loadScreenplayRowForProject = (
  db: Db,
  projectId: string,
): ResultAsync<ScreenplayRowForGen | null, CesareError> =>
  ResultAsync.fromPromise(
    db
      .select({
        id: screenplays.id,
        currentVersionId: screenplays.currentVersionId,
        createdBy: screenplays.createdBy,
        content: screenplays.content,
      })
      .from(screenplays)
      .where(eq(screenplays.projectId, projectId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    (e) =>
      new CesareError(
        `loadScreenplayRowForProject: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

export interface GeneratedScreenplay {
  versionId: string;
  previousVersionId: string | null;
  label: string;
}

const SCREENPLAY_DRAFT_LABEL = "Prima stesura · Cesare";

const handleGenerateScreenplay = (
  input: ProposeInput,
  db: Db,
  projectId: string,
  onDelta?: (text: string) => void,
  abortSignal?: AbortSignal,
): ResultAsync<GeneratedScreenplay, CesareError> =>
  ResultAsync.combine([
    loadScreenplayRowForProject(db, projectId),
    loadUpstreamForScreenplay(db, projectId),
  ]).andThen(([sp, upstream]) => {
    if (!sp) {
      return errAsync(
        new CesareError("Sceneggiatura non trovata per il progetto."),
      );
    }
    if (upstream.text.length === 0) {
      return errAsync(
        new CesareError(
          "Non c'è ancora materiale da cui scrivere la sceneggiatura: scrivi prima il soggetto, la sinossi, la scaletta o il trattamento.",
        ),
      );
    }
    const instructionLine = input.instruction
      ? `Istruzione: ${input.instruction}\n\n`
      : "";
    const user = `${instructionLine}Materiale a monte:\n${upstream.text}\n\nScrivi la prima stesura completa della sceneggiatura in formato Fountain.`;
    return (
      runGeneration(
        SCREENPLAY_FROM_NARRATIVE_SYSTEM,
        user,
        6000,
        "cesare.generateScreenplay",
        onDelta,
        abortSignal,
      )
        // NORMALISE to the editor's canonical Fountain dialect (BUG-N63 + #46/#53
        // root cause). The model is unreliable about element FORMATTING — it
        // collides a cue with its speech ("GIULIO And?"), stacks cues with no
        // blank lines, wrote dialogue at the character indent, transitions as
        // plain action. `normaliseScreenplayFountain` splits inline cues and
        // round-trips through the editor's own parser+serializer, re-deriving
        // every element from its shape and re-emitting the exact indents the
        // editor expects. It must run on the model's ORIGINAL line breaks, so it
        // precedes sanitize (whose reflow would otherwise merge flat cue lines).
        // sanitize then repairs mojibake without touching the now-structural cues.
        .map((s) => sanitizeAiText(normaliseScreenplayFountain(s.trim())))
        .andThen((raw) => {
          if (raw.length === 0) {
            return errAsync(
              new CesareError(
                "Il modello ha restituito una sceneggiatura vuota. Riformula l'istruzione.",
              ),
            );
          }
          const fountain = raw;
          return ResultAsync.fromPromise(
            db.transaction((tx) =>
              importAsActiveVersionTx(tx, {
                screenplayId: sp.id,
                label: SCREENPLAY_DRAFT_LABEL,
                content: fountain,
                prevActiveId: sp.currentVersionId,
                userId: sp.createdBy,
              }),
            ),
            (e) =>
              new CesareError(
                `generate_screenplay_from_narrative apply: ${e instanceof Error ? e.message : String(e)}`,
              ),
          ).map((updated) => ({
            versionId: updated.currentVersionId ?? "",
            previousVersionId: sp.currentVersionId,
            label: SCREENPLAY_DRAFT_LABEL,
          }));
        })
    );
  });

// ─── Public executor ──────────────────────────────────────────────────────────

const successResult = (id: string, payload: unknown): ToolResult => ({
  type: "tool_result",
  tool_use_id: id,
  content: JSON.stringify(payload),
});

const draftPayload = (draft: CreatedDraft) => ({
  ok: true as const,
  version_id: draft.versionId,
  previous_version_id: draft.previousVersionId,
  document_type: draft.documentType,
  label: draft.label,
  applied_live: true as const,
  // Word-level diff segments so the marker emitter (cesare-tools.ts) can ship
  // the `ohw:live-diff-b64` marker and the client renders the coloured inline
  // diff for "Mostra modifiche" on document-gen edits (Spec 47b FIX 4).
  diff_segments: draft.diffSegments,
  diff_label: draft.label,
  toast: `✦ Cesare ha aggiornato ${docTypeLabel(draft.documentType)} — il documento è aggiornato. Apri il pannello Versioni per ripristinare la versione precedente.`,
});

// Spec 76 Slice 2 — the tool result for a large-edit ask. No version was
// written; the client renders the [Sovrascrivi] [Nuova versione] card and the
// chosen action re-sends the same instruction with the confirmation flag set.
const askPayload = (asked: AskedNewVersion) => ({
  ok: true as const,
  asked_new_version: true as const,
  document_type: asked.documentType,
  changed_word_ratio: asked.changedWordRatio,
  applied_live: false as const,
  ask: `Questa è una modifica importante a ${docTypeLabel(
    asked.documentType,
  )} (${Math.round(
    asked.changedWordRatio * 100,
  )}% del testo cambia). La applico sulla versione corrente o ne creo una nuova?`,
});

// One outcome → one payload: a draft was applied, or Cesare asked first.
const outcomePayload = (outcome: CommitOutcome) =>
  isAsked(outcome) ? askPayload(outcome) : draftPayload(outcome);

const screenplayGenPayload = (gen: GeneratedScreenplay) => ({
  ok: true as const,
  version_id: gen.versionId,
  previous_version_id: gen.previousVersionId,
  document_type: "screenplay" as const,
  label: gen.label,
  applied_live: true as const,
  toast: `✦ Cesare ha scritto la prima stesura della Sceneggiatura — è la versione attiva nell'editor. Apri il pannello Versioni per ripristinare la versione precedente.`,
});

export const executeDocumentGenTool = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
  sessionId: string | null = null,
  // Spec 78 §A5 — the user's turn message, threaded so the confirm-card choice
  // ("nuova versione" / "sovrascrivi") is honoured turn-wide rather than re-read
  // from each tool's paraphrased `instruction` (which caused the ask-loop).
  userInstruction: string | null = null,
  // #103 — live token sink for the whole-document generators. When present, the
  // scaletta / treatment / screenplay generation streams and forwards each chunk
  // so the tracer fills progressively. Undefined for the short one-shots and on
  // the non-streaming path (behaviour identical to before).
  onDelta?: (text: string) => void,
  // #103 — the outer turn's cancel signal, forwarded to the streaming generators
  // so a cancelled turn tears their model call down instead of leaking it.
  abortSignal?: AbortSignal,
): ResultAsync<ToolResult, CesareError> => {
  const input = block.input as ProposeInput;
  if (block.name === "propose_logline_from_screenplay") {
    return handleProposeLogline(
      input,
      db,
      projectId,
      userIdFallback,
      sessionId,
      userInstruction,
    ).map((outcome) => successResult(block.id, outcomePayload(outcome)));
  }
  if (block.name === "write_logline") {
    return handleWriteLogline(
      input,
      db,
      projectId,
      userIdFallback,
      sessionId,
      userInstruction,
    ).map((outcome) => successResult(block.id, outcomePayload(outcome)));
  }
  if (block.name === "propose_synopsis_from_screenplay") {
    return handleProposeSynopsis(
      input,
      db,
      projectId,
      userIdFallback,
      sessionId,
      userInstruction,
    ).map((outcome) => successResult(block.id, outcomePayload(outcome)));
  }
  if (block.name === "propose_soggetto_v2") {
    return handleProposeSoggettoV2(
      input,
      db,
      projectId,
      userIdFallback,
      sessionId,
      userInstruction,
    ).map((outcome) => successResult(block.id, outcomePayload(outcome)));
  }
  if (block.name === "propose_scaletta_from_soggetto") {
    return handleProposeScalettaFromSoggetto(
      input,
      db,
      projectId,
      userIdFallback,
      sessionId,
      onDelta,
      abortSignal,
    ).map((outcome) => successResult(block.id, outcomePayload(outcome)));
  }
  if (block.name === "edit_outline_scene") {
    return handleEditOutlineScene(
      input,
      db,
      projectId,
      userIdFallback,
      sessionId,
    ).map((outcome) => successResult(block.id, outcomePayload(outcome)));
  }
  if (block.name === "propose_treatment_from_narrative") {
    return handleProposeTreatment(
      input,
      db,
      projectId,
      userIdFallback,
      sessionId,
      userInstruction,
      onDelta,
      abortSignal,
    ).map((outcome) => successResult(block.id, outcomePayload(outcome)));
  }
  if (block.name === "generate_screenplay_from_narrative") {
    return handleGenerateScreenplay(
      input,
      db,
      projectId,
      onDelta,
      abortSignal,
    ).map((gen) => successResult(block.id, screenplayGenPayload(gen)));
  }
  return okAsync(
    successResult(block.id, {
      ok: false,
      error: `Unknown document-gen tool: ${block.name}`,
    }),
  );
};

/**
 * True for any tool name handled by this module. Used by the runtime dispatcher
 * to route propose_* calls to executeDocumentGenTool before falling through to
 * the existing apply_text_edit / expand_section executors.
 */
export const isDocumentGenToolName = (name: string): boolean =>
  name === "propose_logline_from_screenplay" ||
  name === "write_logline" ||
  name === "propose_synopsis_from_screenplay" ||
  name === "propose_soggetto_v2" ||
  name === "propose_scaletta_from_soggetto" ||
  name === "edit_outline_scene" ||
  name === "propose_treatment_from_narrative" ||
  name === "generate_screenplay_from_narrative";

// ─── Document generation tools factory (AI SDK v5 format) ────────────────────

export const createDocumentGenTools = (
  db: Db,
  projectId: string,
  userIdFallback: string | null,
  sessionId: string | null = null,
  // Spec 78 §A5 — the user's turn message, so the streamed (AI-SDK) path honours
  // the confirm-card choice turn-wide instead of re-asking on a second tool.
  userInstruction: string | null = null,
) => ({
  propose_logline_from_screenplay: tool({
    description:
      "Estrae una logline (max 200 caratteri) DALLA SCENEGGIATURA esistente del progetto. " +
      "Applica live una nuova logline al documento (si aggiorna nell'editor) e crea automaticamente una versione. " +
      "L'utente può ripristinare la versione precedente dal pannello Versioni. Usa SOLO quando l'utente chiede di derivare la logline DALLA sceneggiatura. " +
      "Per scrivere da un'istruzione libera o modificare l'esistente usa write_logline.",
    inputSchema: z.object({
      instruction: z
        .string()
        .optional()
        .describe(
          "Istruzione opzionale che orienta lo stile (es. 'più commerciale', 'focus su personaggio', 'tono ironico')",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await handleProposeLogline(
        input as ProposeInput,
        db,
        projectId,
        userIdFallback,
        sessionId,
        userInstruction,
      );
      if (result.isErr()) return { error: result.error.message };
      return outcomePayload(result.value);
    },
  }),
  write_logline: tool({
    description:
      "Scrive o modifica la logline del progetto (max 200 caratteri) da un'istruzione in linguaggio naturale, " +
      "senza bisogno della sceneggiatura. Applica live al documento e crea automaticamente una versione (ripristinabile dal pannello Versioni). " +
      "Usa quando l'utente chiede di SCRIVERE una logline da una premessa o di MODIFICARE quella esistente. Disponibile da qualunque pagina.",
    inputSchema: z.object({
      instruction: z
        .string()
        .describe(
          "L'istruzione: la premessa da cui scrivere la logline, oppure la modifica da applicare a quella esistente.",
        ),
      mode: z
        .enum(["auto", "write", "edit"])
        .optional()
        .describe(
          "Opzionale. 'write' = scrivi nuova; 'edit' = riscrivi l'esistente; 'auto' (default) = modifica se esiste già, altrimenti scrive nuova.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await handleWriteLogline(
        input as ProposeInput,
        db,
        projectId,
        userIdFallback,
        sessionId,
        userInstruction,
      );
      if (result.isErr()) return { error: result.error.message };
      return outcomePayload(result.value);
    },
  }),
  propose_synopsis_from_screenplay: tool({
    description:
      "Genera una sinossi (2-3 paragrafi, circa 400 parole) dalla sceneggiatura corrente del " +
      "progetto. Applica live la nuova sinossi al documento e crea automaticamente una versione. Usa SEMPRE questo tool quando " +
      "l'utente chiede 'scrivimi la sinossi' o 'genera la sinossi'.",
    inputSchema: z.object({
      instruction: z
        .string()
        .optional()
        .describe(
          "Istruzione opzionale per orientare tono/struttura della sinossi.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await handleProposeSynopsis(
        input as ProposeInput,
        db,
        projectId,
        userIdFallback,
        sessionId,
        userInstruction,
      );
      if (result.isErr()) return { error: result.error.message };
      return outcomePayload(result.value);
    },
  }),
  propose_soggetto_v2: tool({
    description:
      "Riscrive il soggetto del progetto applicandolo live al documento (crea automaticamente una versione) seguendo l'istruzione " +
      "fornita. Usa quando l'utente vuole una variante del soggetto (es. 'più asciutto', " +
      "'più tematico', 'fammi un v2 con focus su X').",
    inputSchema: z.object({
      instruction: z
        .string()
        .describe(
          "Direzione della riscrittura in linguaggio naturale (es. 'più asciutto e tematico').",
        ),
      label: z
        .string()
        .describe(
          "Etichetta breve per la nuova versione draft (es. 'v2 asciutto', 'focus tematico').",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await handleProposeSoggettoV2(
        input as ProposeInput,
        db,
        projectId,
        userIdFallback,
        sessionId,
        userInstruction,
      );
      if (result.isErr()) return { error: result.error.message };
      return outcomePayload(result.value);
    },
  }),
  propose_scaletta_from_soggetto: tool({
    description:
      "Genera l'INTERA scaletta DA ZERO a partire dal soggetto corrente (sostituisce tutte le scene). " +
      "Applica live la nuova scaletta e crea automaticamente una versione. Usa SOLO per (ri)generare " +
      "l'intera scaletta. Per modificare UNA scena esistente usa edit_outline_scene.",
    inputSchema: z.object({
      target_scene_count: z
        .number()
        .int()
        .optional()
        .describe(
          "Numero approssimativo di scene desiderate. Ometti per un default " +
            "adatto al formato (corto ~14, episodio ~28, lungometraggio ~45); " +
            "specificalo solo se l'utente chiede una lunghezza precisa.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await handleProposeScalettaFromSoggetto(
        input as ProposeInput,
        db,
        projectId,
        userIdFallback,
        sessionId,
      );
      if (result.isErr()) return { error: result.error.message };
      return outcomePayload(result.value);
    },
  }),
  edit_outline_scene: tool({
    description:
      "Modifica la descrizione di UNA singola scena esistente della scaletta, lasciando invariate le altre. " +
      "Applica live la modifica e crea automaticamente una versione. Usa SEMPRE questo tool (NON " +
      "propose_scaletta_from_soggetto) per una modifica mirata a una scena specifica " +
      "(es. 'accorcia la scena 1', 'rendi più tesa la scena 3').",
    inputSchema: z.object({
      scene_number: z
        .number()
        .int()
        .describe(
          "Numero della scena da modificare (1-based, come nell'editor).",
        ),
      instruction: z
        .string()
        .describe(
          "Come modificare la scena (es. 'accorcia', 'rendi più teso').",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await handleEditOutlineScene(
        input as ProposeInput & { scene_number?: number },
        db,
        projectId,
        userIdFallback,
        sessionId,
      );
      if (result.isErr()) return { error: result.error.message };
      return outcomePayload(result.value);
    },
  }),
  propose_treatment_from_narrative: tool({
    description:
      "Scrive il trattamento del film derivandolo dal materiale narrativo a monte (scaletta, sinossi, soggetto, logline). " +
      "Applica live il nuovo trattamento al documento e crea automaticamente una versione. Usa quando l'utente chiede " +
      "'scrivi il trattamento' o 'genera il trattamento dalla scaletta'. Se il trattamento esiste già lo riscrive seguendo l'istruzione.",
    inputSchema: z.object({
      instruction: z
        .string()
        .optional()
        .describe(
          "Istruzione opzionale per orientare tono/struttura del trattamento (es. 'più dettagliato sull'Atto II', 'tono cupo').",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await handleProposeTreatment(
        input as ProposeInput,
        db,
        projectId,
        userIdFallback,
        sessionId,
        userInstruction,
      );
      if (result.isErr()) return { error: result.error.message };
      return outcomePayload(result.value);
    },
  }),
  generate_screenplay_from_narrative: tool({
    description:
      "Scrive la PRIMA STESURA della SCENEGGIATURA (formato Fountain) derivandola dal materiale narrativo a monte " +
      "(scaletta, trattamento, sinossi, soggetto, logline). La applica LIVE come nuova versione ATTIVA della " +
      "sceneggiatura (l'editor si aggiorna; la versione precedente resta ripristinabile dal pannello Versioni). " +
      "Usa quando l'utente chiede 'scrivi la sceneggiatura', 'scrivimi la prima stesura della sceneggiatura', " +
      "'partendo dal soggetto fammi la sceneggiatura' o simili. NON usare per modificare una sceneggiatura " +
      "esistente — per riscritture strutturali usa propose_screenplay_revision, per una singola scena rewrite_scene.",
    inputSchema: z.object({
      instruction: z
        .string()
        .optional()
        .describe(
          "Istruzione opzionale per orientare tono/struttura della stesura (es. 'taglia i tempi morti', 'dialoghi più asciutti').",
        ),
      target_page_count: z
        .number()
        .int()
        .optional()
        .describe("Numero approssimativo di pagine desiderate (opzionale)."),
    }),
    execute: async (input, _opts) => {
      const result = await handleGenerateScreenplay(
        input as ProposeInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return screenplayGenPayload(result.value);
    },
  }),
});

export type DocumentGenTools = ReturnType<typeof createDocumentGenTools>;
