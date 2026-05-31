import { tool } from "ai";
import { z } from "zod";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { eq, sql } from "drizzle-orm";
import {
  documents,
  documentVersions,
  screenplays,
} from "@oh-writers/db/schema";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { callHaiku, extractText } from "~/features/ai";
import { repairMojibake } from "@oh-writers/utils";
import { SONNET_MODEL } from "./cesare-model-router";
import { CesareError } from "./cesare.errors";
import { applyVersionLive, type CreatedDraft } from "./auto-version.effect";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const CESARE_DOCUMENT_GEN_TOOLS = [
  {
    name: "propose_logline_from_screenplay",
    description:
      "Estrae una logline (max 200 caratteri) DALLA SCENEGGIATURA esistente del progetto. " +
      "Applica live una nuova logline al documento (si aggiorna nell'editor) e crea automaticamente una versione. " +
      "L'utente può ripristinare con Annulla. Usa questo tool SOLO quando l'utente chiede esplicitamente " +
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
      "(l'utente può ripristinare con ↩ Annulla). Usa questo tool quando l'utente: " +
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
      "Genera la scaletta (lista numerata di scene/sequenze) a partire dal soggetto corrente. " +
      "Applica live la nuova scaletta al documento e crea automaticamente una versione. Usa quando l'utente chiede 'dato il " +
      "soggetto fammi la scaletta' o simile.",
    input_schema: {
      type: "object" as const,
      properties: {
        target_scene_count: {
          type: "integer",
          description:
            "Numero approssimativo di scene desiderate (default 40).",
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
};

// Monotonic counter that keeps each MOCK_AI document generation distinct, so the
// applyVersionLive duplicate guard never trips when an E2E suite exercises the
// same project repeatedly (e.g. A6 + A7 both applying propose_soggetto_v2).
// Mock-only; never used on the real generation path.
let mockGenerationNonce = 0;

const runGeneration = (
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  operation: string,
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
    return okAsync(`${text}${suffix}`);
  }
  return callHaiku(
    {
      system: systemPrompt,
      fewShot: [],
      user: userPrompt,
      model: SONNET_MODEL,
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
  mode?: "auto" | "write" | "edit";
}

const handleProposeLogline = (
  input: ProposeInput,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
): ResultAsync<CreatedDraft, CesareError> =>
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
            return applyVersionLive(
              db,
              doc.id,
              DocumentTypes.LOGLINE,
              creator,
              logline,
              buildDraftLabel(DocumentTypes.LOGLINE, input.instruction ?? null),
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
): ResultAsync<CreatedDraft, CesareError> => {
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
          return applyVersionLive(
            db,
            doc.id,
            DocumentTypes.LOGLINE,
            creator,
            logline,
            buildDraftLabel(DocumentTypes.LOGLINE, instruction),
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
): ResultAsync<CreatedDraft, CesareError> =>
  loadScreenplayContent(db, projectId).andThen((screenplay) => {
    if (screenplay.trim().length === 0) {
      return errAsync(
        new CesareError(
          "La sceneggiatura del progetto è vuota: aggiungi del testo prima di generare la sinossi.",
        ),
      );
    }
    const user = `${input.instruction ? `Istruzione: ${input.instruction}\n\n` : ""}Sceneggiatura:\n---\n${screenplay.slice(0, 18_000)}\n---`;
    return runGeneration(SYNOPSIS_SYSTEM, user, 1200, "cesare.proposeSynopsis")
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
            return applyVersionLive(
              db,
              doc.id,
              DocumentTypes.SYNOPSIS,
              creator,
              synopsis,
              buildDraftLabel(
                DocumentTypes.SYNOPSIS,
                input.instruction ?? null,
              ),
            );
          },
        ),
      );
  });

const handleProposeSoggettoV2 = (
  input: ProposeInput,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
): ResultAsync<CreatedDraft, CesareError> => {
  if (!input.instruction || !input.label) {
    return errAsync(
      new CesareError(
        "propose_soggetto_v2 richiede sia `instruction` che `label`.",
      ),
    );
  }
  const instruction = input.instruction;
  const label = input.label;
  return loadDocumentForType(db, projectId, DocumentTypes.SOGGETTO).andThen(
    (doc) => {
      if (!doc) {
        return errAsync(
          new CesareError("Documento soggetto non trovato per il progetto."),
        );
      }
      if (doc.content.trim().length === 0) {
        return errAsync(
          new CesareError(
            "Il soggetto è vuoto: scrivi un soggetto prima di chiederne una variante.",
          ),
        );
      }
      const user = `Stai riscrivendo IL SOGGETTO seguendo questa istruzione: ${instruction}.

REGOLA TASSATIVA: la tua versione DEVE essere diversa dal soggetto attuale. Non limitarti a riformattarlo. Cambia tono/struttura/dettagli secondo l'istruzione. Se non hai abbastanza informazione per cambiare nulla, espandi i dettagli sensoriali e drammatici delle scene esistenti.

Soggetto attuale (NON ritornarlo identico):
---
${doc.content.slice(0, 18_000)}
---`;
      const previousContent = doc.content.trim();
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
          // already". A draft identical to v1 is worse than no draft.
          if (next === previousContent) {
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
          return applyVersionLive(
            db,
            doc.id,
            DocumentTypes.SOGGETTO,
            creator,
            next,
            label.slice(0, 80),
          );
        });
    },
  );
};

const handleProposeScalettaFromSoggetto = (
  input: ProposeInput,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
): ResultAsync<CreatedDraft, CesareError> =>
  loadDocumentForType(db, projectId, DocumentTypes.SOGGETTO).andThen((doc) => {
    if (!doc || doc.content.trim().length === 0) {
      return errAsync(
        new CesareError(
          "Soggetto vuoto o mancante: scrivilo prima di generare la scaletta.",
        ),
      );
    }
    const targetCount = Number.isFinite(input.target_scene_count)
      ? Math.max(8, Math.min(120, Number(input.target_scene_count)))
      : 40;
    const user = `Numero di scene desiderate: circa ${targetCount}.\n\nSoggetto:\n---\n${doc.content.slice(0, 18_000)}\n---`;
    return runGeneration(SCALETTA_SYSTEM, user, 3000, "cesare.proposeScaletta")
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
            return applyVersionLive(
              db,
              outlineDoc.id,
              DocumentTypes.OUTLINE,
              creator,
              content,
              buildDraftLabel(DocumentTypes.OUTLINE, "da soggetto"),
            );
          },
        ),
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
  toast: `✦ Cesare ha aggiornato ${docTypeLabel(draft.documentType)} — il documento è aggiornato. Usa ↩ Annulla per ripristinare.`,
});

export const executeDocumentGenTool = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
  userIdFallback: string | null,
): ResultAsync<ToolResult, CesareError> => {
  const input = block.input as ProposeInput;
  if (block.name === "propose_logline_from_screenplay") {
    return handleProposeLogline(input, db, projectId, userIdFallback).map(
      (draft) => successResult(block.id, draftPayload(draft)),
    );
  }
  if (block.name === "write_logline") {
    return handleWriteLogline(input, db, projectId, userIdFallback).map(
      (draft) => successResult(block.id, draftPayload(draft)),
    );
  }
  if (block.name === "propose_synopsis_from_screenplay") {
    return handleProposeSynopsis(input, db, projectId, userIdFallback).map(
      (draft) => successResult(block.id, draftPayload(draft)),
    );
  }
  if (block.name === "propose_soggetto_v2") {
    return handleProposeSoggettoV2(input, db, projectId, userIdFallback).map(
      (draft) => successResult(block.id, draftPayload(draft)),
    );
  }
  if (block.name === "propose_scaletta_from_soggetto") {
    return handleProposeScalettaFromSoggetto(
      input,
      db,
      projectId,
      userIdFallback,
    ).map((draft) => successResult(block.id, draftPayload(draft)));
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
  name === "propose_scaletta_from_soggetto";

// ─── Document generation tools factory (AI SDK v5 format) ────────────────────

export const createDocumentGenTools = (
  db: Db,
  projectId: string,
  userIdFallback: string | null,
) => ({
  propose_logline_from_screenplay: tool({
    description:
      "Estrae una logline (max 200 caratteri) DALLA SCENEGGIATURA esistente del progetto. " +
      "Applica live una nuova logline al documento (si aggiorna nell'editor) e crea automaticamente una versione. " +
      "L'utente può ripristinare con Annulla. Usa SOLO quando l'utente chiede di derivare la logline DALLA sceneggiatura. " +
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
      );
      if (result.isErr()) return { error: result.error.message };
      return draftPayload(result.value);
    },
  }),
  write_logline: tool({
    description:
      "Scrive o modifica la logline del progetto (max 200 caratteri) da un'istruzione in linguaggio naturale, " +
      "senza bisogno della sceneggiatura. Applica live al documento e crea automaticamente una versione (↩ Annulla per ripristinare). " +
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
      );
      if (result.isErr()) return { error: result.error.message };
      return draftPayload(result.value);
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
      );
      if (result.isErr()) return { error: result.error.message };
      return draftPayload(result.value);
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
      );
      if (result.isErr()) return { error: result.error.message };
      return draftPayload(result.value);
    },
  }),
  propose_scaletta_from_soggetto: tool({
    description:
      "Genera la scaletta (lista numerata di scene/sequenze) a partire dal soggetto corrente. " +
      "Applica live la nuova scaletta al documento e crea automaticamente una versione. Usa quando l'utente chiede 'dato il " +
      "soggetto fammi la scaletta' o simile.",
    inputSchema: z.object({
      target_scene_count: z
        .number()
        .int()
        .optional()
        .describe("Numero approssimativo di scene desiderate (default 40)."),
    }),
    execute: async (input, _opts) => {
      const result = await handleProposeScalettaFromSoggetto(
        input as ProposeInput,
        db,
        projectId,
        userIdFallback,
      );
      if (result.isErr()) return { error: result.error.message };
      return draftPayload(result.value);
    },
  }),
});

export type DocumentGenTools = ReturnType<typeof createDocumentGenTools>;
