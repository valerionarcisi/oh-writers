import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import {
  locationCandidates,
  locationPhotos,
  locationRequirements,
  budgets,
  budgetLines,
  budgetCaps,
  TOP_SHEETS,
  documents,
  documentVersions,
  breakdownElements,
  breakdownOccurrences,
  scenes,
  screenplays,
  productionRates,
  BREAKDOWN_CATEGORIES,
  type BreakdownCategoryDb,
} from "@oh-writers/db/schema";
import {
  findExcessiveLines,
  evaluateAgainstCap,
  proposeMissingLines,
  type IntelligenceLine,
  type CapEvaluation,
  type ExcessiveLineFlag,
  type MissingLineProposal,
} from "./cesare-budget-intelligence";
import type { DocumentType } from "@oh-writers/domain";
import {
  estimateSceneCost,
  DEFAULT_PRODUCTION_RATES,
  type ProductionRates,
} from "@oh-writers/domain";
import type { Db } from "~/server/db";
import type { ProjectAccess } from "~/server/access";
import { callHaiku, extractText } from "~/features/ai";
import type { SkillExecutor } from "./skills/types";
import { CesareError } from "./cesare.errors";
import {
  CESARE_SCHEDULE_TOOLS,
  executeScheduleTool,
  type ScheduleToolContext,
} from "./cesare-schedule-tools";
import {
  CESARE_SHOOTING_PLAN_TOOLS,
  executeShootingPlanTool,
  type ShootingPlanToolContext,
} from "./cesare-shooting-plan-tools";
import { CESARE_READ_TOOLS, tryExecuteReadTool } from "./cesare-read-tools";
import {
  CESARE_SCREENPLAY_TOOLS,
  executeScreenplayTool,
} from "./cesare-screenplay-tools";
import {
  CESARE_DOCUMENT_GEN_TOOLS,
  executeDocumentGenTool,
  isDocumentGenToolName,
} from "./cesare-document-tools";

export { CESARE_SCHEDULE_TOOLS } from "./cesare-schedule-tools";
export type { ScheduleToolContext } from "./cesare-schedule-tools";
export { CESARE_SHOOTING_PLAN_TOOLS } from "./cesare-shooting-plan-tools";
export type { ShootingPlanToolContext } from "./cesare-shooting-plan-tools";
export { CESARE_READ_TOOLS } from "./cesare-read-tools";

const MAX_PHOTOS_PER_CANDIDATE = 3;
const PHOTO_MAX_WIDTH_PX = 800;

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const CESARE_LOCATION_TOOLS = [
  {
    name: "search_places",
    description:
      "Cerca luoghi reali (locali, edifici, parchi, strade, etc.) tramite Google Places. " +
      "Usa questo tool quando l'utente chiede di trovare location fisiche in una zona geografica.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Query di ricerca, es. 'trattoria Piane di Falerone' o 'edificio industriale Torino'",
        },
        location_bias: {
          type: "string",
          description:
            "Città o zona geografica per restringere la ricerca, es. 'Piane di Falerone, FM'",
        },
        max_results: {
          type: "number",
          description: "Numero massimo di risultati (default 5, max 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "add_candidate",
    description:
      "Aggiunge un candidato reale alla location requirement corrente. " +
      "Usa questo tool dopo search_places per salvare i risultati rilevanti. " +
      "IMPORTANTE: se il candidato viene da un risultato di search_places, passa SEMPRE " +
      "i `photo_names` ricevuti per quel place (fino a 3) così le foto vengono salvate.",
    input_schema: {
      type: "object" as const,
      properties: {
        requirement_id: {
          type: "string",
          description:
            "UUID del location requirement a cui aggiungere il candidato",
        },
        name: { type: "string", description: "Nome del luogo" },
        address: { type: "string", description: "Indirizzo completo" },
        lat: { type: "number", description: "Latitudine" },
        lng: { type: "number", description: "Longitudine" },
        notes: {
          type: "string",
          description:
            "Note sintetiche su perché questo candidato è rilevante per la scena",
        },
        photo_names: {
          type: "array",
          items: { type: "string" },
          description:
            "Nomi delle foto Google Places nel formato 'places/X/photos/Y' " +
            "(prendili dal campo `photos[].name` del risultato di search_places, max 3).",
        },
      },
      required: ["requirement_id", "name"],
    },
  },
] as const;

// ─── Document tool definitions ────────────────────────────────────────────────

export const CESARE_DOCUMENT_TOOLS = [
  {
    name: "apply_text_edit",
    description:
      "Sostituisce una stringa esatta nel documento attivo (soggetto / sinossi / scaletta / trattamento). " +
      "Usa questo tool quando l'utente chiede una modifica testuale puntuale, come 'cambia X in Y' o 'riscrivi questa frase'. " +
      "La stringa `find` deve essere un sottoesempio testuale ESATTO del documento, copia-incollalo letteralmente. " +
      "Se `find` non viene trovato, l'edit fallisce: non inventare il testo originale.",
    input_schema: {
      type: "object" as const,
      properties: {
        find: {
          type: "string",
          description:
            "Sottostringa esatta da cercare nel documento. Deve corrispondere carattere per carattere.",
        },
        replace: {
          type: "string",
          description: "Nuovo testo che sostituirà `find`.",
        },
      },
      required: ["find", "replace"],
    },
  },
  {
    name: "expand_section",
    description:
      "Trova la sezione del documento sotto un certo heading e la espande in 2-3 paragrafi più ricchi, " +
      "preservando voce narrativa, tono e beat principali. L'heading è identificato cercando una riga " +
      "che inizia con `#`, `##`, `###` o che combacia esattamente col titolo. " +
      "Usalo quando l'utente chiede 'espandi atto II', 'sviluppa la sezione X' o simili.",
    input_schema: {
      type: "object" as const,
      properties: {
        heading: {
          type: "string",
          description:
            "Titolo della sezione da espandere (es. 'Atto II', 'Primo atto', 'Conclusione'). " +
            "Confronto case-insensitive e tollerante a marker markdown.",
        },
      },
      required: ["heading"],
    },
  },
  {
    name: "compress_section",
    description:
      "Trova la sezione del documento sotto un certo heading e la comprime al numero di parole indicato, " +
      "mantenendo i beat chiave e la voce. Usalo quando l'utente chiede 'accorcia X', 'riassumi questa parte' " +
      "o quando una sezione è troppo lunga.",
    input_schema: {
      type: "object" as const,
      properties: {
        heading: {
          type: "string",
          description: "Titolo della sezione da comprimere.",
        },
        target_words: {
          type: "number",
          description:
            "Numero di parole target. Tipicamente tra 80 e 300 a seconda del tipo di documento.",
        },
      },
      required: ["heading", "target_words"],
    },
  },
] as const;

// ─── Breakdown tools ──────────────────────────────────────────────────────────

export const CESARE_BREAKDOWN_TOOLS = [
  {
    name: "tag_element",
    description:
      "Aggiunge un elemento al breakdown della scena indicata (cast, prop, location, etc.). " +
      "Crea l'elemento se non esiste già e collega l'occurrence alla scena. " +
      "Usa questo tool quando l'utente chiede di 'spogliare X' o 'aggiungere X come oggetto'.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: {
          type: "number",
          description: "Numero ordinale della scena (1-based).",
        },
        category: {
          type: "string",
          description:
            "Categoria del breakdown: cast, extras, stunts, props, vehicles, wardrobe, makeup, sfx, vfx, sound, animals, atmosphere, set_dress, equipment, locations.",
        },
        name: {
          type: "string",
          description: "Nome dell'elemento (es. 'pistola', 'tavolo cucina').",
        },
        quantity: {
          type: "number",
          description: "Quantità (default 1).",
        },
      },
      required: ["scene_number", "category", "name"],
    },
  },
  {
    name: "accept_ghost",
    description:
      "Accetta un suggerimento ghost (verde tratteggiato) e lo trasforma in elemento confermato del breakdown.",
    input_schema: {
      type: "object" as const,
      properties: {
        occurrence_id: {
          type: "string",
          description: "UUID dell'occurrence da accettare.",
        },
      },
      required: ["occurrence_id"],
    },
  },
  {
    name: "reject_ghost",
    description:
      "Rifiuta un suggerimento ghost rimuovendolo dalla lista delle proposte attive.",
    input_schema: {
      type: "object" as const,
      properties: {
        occurrence_id: {
          type: "string",
          description: "UUID dell'occurrence da rifiutare.",
        },
      },
      required: ["occurrence_id"],
    },
  },
  {
    name: "estimate_scene_cost",
    description:
      "Calcola il costo stimato e la difficoltà di una scena usando i dati del breakdown e le rate di produzione del progetto. " +
      "Restituisce totale, righe per categoria, difficoltà 1-5 e note.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: {
          type: "number",
          description: "Numero ordinale della scena (1-based).",
        },
      },
      required: ["scene_number"],
    },
  },
  {
    name: "add_to_budget",
    description:
      "Converte la stima di costo di una scena in righe budget reali. " +
      "Crea una riga per ciascuna voce della stima nel budget corrente del progetto.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: {
          type: "number",
          description:
            "Numero ordinale della scena di cui aggiungere i costi al budget.",
        },
      },
      required: ["scene_number"],
    },
  },
] as const;

// ─── Google Places types ──────────────────────────────────────────────────────

export interface PlacePhoto {
  name: string;
  widthPx: number;
  heightPx: number;
}

export interface PlaceResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId: string;
  types: string[];
  photos: PlacePhoto[];
}

// ─── Google Places executor ───────────────────────────────────────────────────

interface SearchPlacesInput {
  query: string;
  location_bias?: string;
  max_results?: number;
}

interface GooglePlacesResponse {
  places?: Array<{
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    id?: string;
    types?: string[];
    photos?: Array<{
      name?: string;
      widthPx?: number;
      heightPx?: number;
    }>;
  }>;
}

export const executeSearchPlaces = (
  input: SearchPlacesInput,
): ResultAsync<PlaceResult[], CesareError> => {
  const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
  if (!apiKey) {
    return errAsync(
      new CesareError(
        "GOOGLE_PLACES_API_KEY non configurata — ricerca Google Places non disponibile",
      ),
    );
  }

  const maxResults = Math.min(input.max_results ?? 5, 10);
  const textQuery = input.location_bias
    ? `${input.query} ${input.location_bias}`
    : input.query;

  return ResultAsync.fromPromise(
    (async (): Promise<PlaceResult[]> => {
      const response = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "places.displayName,places.formattedAddress,places.location,places.id,places.types,places.photos",
          },
          body: JSON.stringify({ textQuery, pageSize: maxResults }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Google Places API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as GooglePlacesResponse;
      return (data.places ?? []).map((p) => ({
        name: p.displayName?.text ?? "Luogo sconosciuto",
        address: p.formattedAddress ?? "",
        lat: p.location?.latitude ?? 0,
        lng: p.location?.longitude ?? 0,
        placeId: p.id ?? "",
        types: p.types ?? [],
        photos: (p.photos ?? [])
          .slice(0, MAX_PHOTOS_PER_CANDIDATE)
          .map((ph) => ({
            name: ph.name ?? "",
            widthPx: ph.widthPx ?? 0,
            heightPx: ph.heightPx ?? 0,
          }))
          .filter((ph) => ph.name.length > 0),
      }));
    })(),
    (e) =>
      new CesareError(
        `Google Places fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );
};

// ─── DB executors ─────────────────────────────────────────────────────────────

interface AddCandidateInput {
  requirement_id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  notes?: string;
  photo_names?: string[];
}

const buildPlacePhotoUrl = (photoName: string, apiKey: string): string =>
  // SECURITY TODO: API key is embedded inline in the stored URL. Move to a server-side
  // proxy endpoint (e.g. /api/places-photo?name=...) before exposing these URLs publicly.
  `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH_PX}&key=${apiKey}`;

export const executeAddCandidate = (
  input: AddCandidateInput,
  db: Db,
  projectId: string,
): ResultAsync<{ id: string }, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      // Verify requirement belongs to the project in one query
      const [req] = await db
        .select({ id: locationRequirements.id })
        .from(locationRequirements)
        .where(
          and(
            eq(locationRequirements.id, input.requirement_id),
            eq(locationRequirements.projectId, projectId),
          ),
        )
        .limit(1);

      if (!req) {
        throw new Error(
          `Requirement ${input.requirement_id} not found or does not belong to project ${projectId}`,
        );
      }

      const [inserted] = await db
        .insert(locationCandidates)
        .values({
          requirementId: input.requirement_id,
          name: input.name,
          address: input.address ?? null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          notes: input.notes ?? null,
          aiSuggested: true,
          aiReasoning: input.notes ?? null,
          status: "candidate",
        })
        .returning({ id: locationCandidates.id });

      if (!inserted) throw new Error("Insert returned no rows");

      const photoNames = (input.photo_names ?? [])
        .filter((n) => typeof n === "string" && n.startsWith("places/"))
        .slice(0, MAX_PHOTOS_PER_CANDIDATE);

      if (photoNames.length > 0) {
        const apiKey = process.env["GOOGLE_PLACES_API_KEY"];
        if (apiKey) {
          await db.insert(locationPhotos).values(
            photoNames.map((photoName) => ({
              candidateId: inserted.id,
              url: buildPlacePhotoUrl(photoName, apiKey),
              caption: null,
            })),
          );
        }
      }

      return { id: inserted.id };
    })(),
    (e) =>
      new CesareError(
        `executeAddCandidate failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

// ─── Tool router ──────────────────────────────────────────────────────────────

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

const isToolUseBlock = (b: unknown): b is ToolUseBlock =>
  typeof b === "object" &&
  b !== null &&
  (b as ToolUseBlock).type === "tool_use";

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

// ─── Document executors ───────────────────────────────────────────────────────

export interface DocumentContext {
  documentId: string;
  documentType: DocumentType;
  /** Pre-loaded current content. The executor uses this as the source of truth
   *  to make the chained tool calls within one Cesare turn consistent. */
  content: string;
}

interface ApplyTextEditInput {
  find: string;
  replace: string;
}

interface SectionRange {
  /** Inclusive line index of the heading itself. */
  headingLine: number;
  /** Inclusive start of the section body. */
  bodyStart: number;
  /** Exclusive end of the section body (next heading at same/upper level). */
  bodyEnd: number;
  /** Reconstructed heading line text. */
  headingText: string;
}

// Updates documents.content and the active version row in one transaction.
// Mirrors the persistence pattern in saveDocument so the Versions popover
// stays consistent and onSuccess invalidations on the client pick up the new
// content via the standard ["documents", projectId, type] query key.
const persistDocumentContent = (
  db: Db,
  documentId: string,
  nextContent: string,
): ResultAsync<void, CesareError> =>
  ResultAsync.fromPromise(
    db.transaction(async (tx) => {
      const [doc] = await tx
        .select({
          id: documents.id,
          currentVersionId: documents.currentVersionId,
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
      if (!doc) throw new Error(`Document ${documentId} not found`);

      if (doc.currentVersionId) {
        await tx
          .update(documentVersions)
          .set({ content: nextContent, updatedAt: new Date() })
          .where(eq(documentVersions.id, doc.currentVersionId));
      }
      await tx
        .update(documents)
        .set({ content: nextContent, updatedAt: new Date() })
        .where(eq(documents.id, doc.id));
    }),
    (e) =>
      new CesareError(
        `persistDocumentContent failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).map(() => undefined);

const normalizeHeading = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

// Locates a section defined by a heading. Headings are either markdown
// (`#`, `##`, `###`) or a standalone line whose normalized text matches the
// requested heading. The body extends until the next heading line.
export const findSection = (
  content: string,
  heading: string,
): SectionRange | null => {
  const target = normalizeHeading(heading);
  if (!target) return null;
  const lines = content.split("\n");

  const isHeadingLine = (line: string): boolean =>
    /^#{1,6}\s+\S/.test(line.trim());

  // Match strategy: exact normalized equality, then whole-word containment.
  // `startsWith`-style fuzz is intentionally avoided because "atto i" would
  // otherwise match "atto ii" and steal the wrong section.
  const isWholeWordMatch = (norm: string): boolean => {
    if (norm === target) return true;
    // Whole-word containment: both endpoints must be at a word boundary.
    const padded = ` ${norm} `;
    const needle = ` ${target} `;
    return padded.includes(needle);
  };

  let headingLine = -1;
  let headingText = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const norm = normalizeHeading(line);
    if (!norm) continue;
    if (!isWholeWordMatch(norm)) continue;
    // Prefer real markdown headings; fall back to plain matching lines.
    if (isHeadingLine(line) || norm === target) {
      headingLine = i;
      headingText = line;
      break;
    }
  }

  if (headingLine < 0) return null;

  const bodyStart = headingLine + 1;
  let bodyEnd = lines.length;
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (isHeadingLine(line)) {
      bodyEnd = i;
      break;
    }
  }

  return { headingLine, bodyStart, bodyEnd, headingText };
};

const sliceSection = (content: string, range: SectionRange): string =>
  content.split("\n").slice(range.bodyStart, range.bodyEnd).join("\n").trim();

const replaceSection = (
  content: string,
  range: SectionRange,
  next: string,
): string => {
  const lines = content.split("\n");
  const before = lines.slice(0, range.bodyStart);
  const after = lines.slice(range.bodyEnd);
  // Ensure exactly one blank line between heading and body, and between body
  // and the next heading, so the document stays well-structured.
  const trimmedNext = next.trim();
  const body = trimmedNext.length > 0 ? ["", trimmedNext, ""] : [""];
  return [...before, ...body, ...after].join("\n");
};

const docTypeLabel = (type: DocumentType): string => {
  switch (type) {
    case "soggetto":
      return "soggetto";
    case "synopsis":
      return "sinossi";
    case "outline":
      return "scaletta";
    case "treatment":
      return "trattamento";
    case "logline":
      return "logline";
    default:
      return type;
  }
};

const executeApplyTextEdit = (
  input: ApplyTextEditInput,
  db: Db,
  doc: DocumentContext,
): ResultAsync<
  { ok: boolean; reason?: string; toast?: string },
  CesareError
> => {
  if (!input.find) {
    return okAsync({ ok: false, reason: "empty find string" });
  }
  if (!doc.content.includes(input.find)) {
    return okAsync({
      ok: false,
      reason:
        "`find` string not found verbatim in the document — re-read the document and use an exact substring",
    });
  }
  const next = doc.content.replace(input.find, input.replace);
  return persistDocumentContent(db, doc.documentId, next).map(() => {
    // Mutate the in-memory copy so subsequent tool calls in the same turn
    // see the updated content.
    doc.content = next;
    return {
      ok: true,
      toast: `✦ Cesare ha aggiornato il ${docTypeLabel(doc.documentType)}`,
    };
  });
};

const EXPAND_SECTION_MODEL = "claude-haiku-4-5";

const expandSectionPrompt = (
  docType: DocumentType,
  fullDocument: string,
  sectionText: string,
  heading: string,
): string => `Sei un editor letterario. Espandi la sezione "${heading}" del ${docTypeLabel(docType)} qui sotto in 2-3 paragrafi più ricchi.

REGOLE:
- Preserva voce, tono e beat narrativi della sezione attuale.
- Mantieni coerenza con il resto del documento (contesto fornito sotto).
- Scrivi in italiano.
- Niente meta-commenti, niente intestazioni, niente liste: solo prosa narrativa.
- Output: SOLO il nuovo testo della sezione, senza ripetere il titolo.

DOCUMENTO COMPLETO:
---
${fullDocument}
---

SEZIONE DA ESPANDERE ("${heading}"):
---
${sectionText || "(vuota)"}
---`;

const compressSectionPrompt = (
  docType: DocumentType,
  fullDocument: string,
  sectionText: string,
  heading: string,
  targetWords: number,
): string => `Sei un editor letterario. Comprimi la sezione "${heading}" del ${docTypeLabel(docType)} a circa ${targetWords} parole.

REGOLE:
- Mantieni tutti i beat chiave della sezione.
- Preserva voce e tono dell'autore.
- Scrivi in italiano.
- Niente meta-commenti, niente intestazioni: solo prosa.
- Output: SOLO il nuovo testo della sezione.

DOCUMENTO COMPLETO:
---
${fullDocument}
---

SEZIONE DA COMPRIMERE ("${heading}"):
---
${sectionText}
---`;

interface ExpandSectionInput {
  heading: string;
}

interface CompressSectionInput {
  heading: string;
  target_words: number;
}

const generateAndReplaceSection = (
  db: Db,
  doc: DocumentContext,
  heading: string,
  prompt: string,
  maxTokens: number,
  toastVerb: string,
): ResultAsync<
  { ok: boolean; reason?: string; toast?: string },
  CesareError
> => {
  const range = findSection(doc.content, heading);
  if (!range) {
    return okAsync({
      ok: false,
      reason: `Section "${heading}" not found. Use exact heading text from the document.`,
    });
  }

  return callHaiku(
    {
      system:
        "Sei un editor letterario professionale. Rispondi sempre in italiano.",
      fewShot: [],
      user: prompt,
      model: EXPAND_SECTION_MODEL,
      maxTokens,
    },
    "cesare.documents.section",
  )
    .mapErr((e) => new CesareError(`Section generation failed: ${e.message}`))
    .andThen((haiku) => {
      const newText = extractText(haiku.content);
      if (!newText) {
        return errAsync(
          new CesareError("Haiku returned no text for section generation"),
        );
      }
      const nextContent = replaceSection(doc.content, range, newText);
      return persistDocumentContent(db, doc.documentId, nextContent).map(() => {
        doc.content = nextContent;
        return {
          ok: true,
          toast: `✦ Cesare ha ${toastVerb} "${range.headingText.replace(/^#+\s*/, "").trim()}"`,
        };
      });
    });
};

export const executeDocumentTool = (
  block: ToolUseBlock,
  db: Db,
  docContext: DocumentContext,
): ResultAsync<ToolResult, CesareError> => {
  const successResult = (id: string, payload: unknown): ToolResult => ({
    type: "tool_result",
    tool_use_id: id,
    content: JSON.stringify(payload),
  });

  if (block.name === "apply_text_edit") {
    const input = block.input as ApplyTextEditInput;
    return executeApplyTextEdit(input, db, docContext).map((res) =>
      successResult(block.id, res),
    );
  }

  if (block.name === "expand_section") {
    const input = block.input as ExpandSectionInput;
    const range = findSection(docContext.content, input.heading);
    const sectionText = range ? sliceSection(docContext.content, range) : "";
    return generateAndReplaceSection(
      db,
      docContext,
      input.heading,
      expandSectionPrompt(
        docContext.documentType,
        docContext.content,
        sectionText,
        input.heading,
      ),
      800,
      "espanso",
    ).map((res) => successResult(block.id, res));
  }

  if (block.name === "compress_section") {
    const input = block.input as CompressSectionInput;
    const range = findSection(docContext.content, input.heading);
    const sectionText = range ? sliceSection(docContext.content, range) : "";
    return generateAndReplaceSection(
      db,
      docContext,
      input.heading,
      compressSectionPrompt(
        docContext.documentType,
        docContext.content,
        sectionText,
        input.heading,
        input.target_words,
      ),
      600,
      "compresso",
    ).map((res) => successResult(block.id, res));
  }

  return okAsync(
    successResult(block.id, {
      error: `Unknown document tool: ${block.name}`,
    }),
  );
};

// ─── Breakdown executors ──────────────────────────────────────────────────────

interface TagElementInput {
  scene_number: number;
  category: string;
  name: string;
  quantity?: number;
}

interface GhostInput {
  occurrence_id: string;
}

interface SceneNumberInput {
  scene_number: number;
}

const findSceneIdByNumber = (
  db: Db,
  projectId: string,
  sceneNumber: number,
): ResultAsync<{ sceneId: string; screenplayVersionId: string }, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [screenplay] = await db
        .select({
          id: screenplays.id,
          currentVersionId: screenplays.currentVersionId,
        })
        .from(screenplays)
        .where(eq(screenplays.projectId, projectId))
        .limit(1);
      if (!screenplay)
        throw new Error(`No screenplay for project ${projectId}`);
      if (!screenplay.currentVersionId)
        throw new Error("Screenplay has no current version");
      const [scene] = await db
        .select({ id: scenes.id })
        .from(scenes)
        .where(
          and(
            eq(scenes.screenplayId, screenplay.id),
            eq(scenes.number, sceneNumber),
          ),
        )
        .limit(1);
      if (!scene) throw new Error(`Scene ${sceneNumber} not found`);
      return {
        sceneId: scene.id,
        screenplayVersionId: screenplay.currentVersionId,
      };
    })(),
    (e) =>
      new CesareError(
        `findSceneIdByNumber: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

const VALID_CATEGORIES: ReadonlyArray<BreakdownCategoryDb> =
  BREAKDOWN_CATEGORIES;

const executeTagElement = (
  input: TagElementInput,
  db: Db,
  projectId: string,
): ResultAsync<
  { elementId: string; occurrenceId: string; toast_message: string },
  CesareError
> => {
  const cat = input.category as BreakdownCategoryDb;
  if (!VALID_CATEGORIES.includes(cat)) {
    return errAsync(new CesareError(`Invalid category: ${input.category}`));
  }
  return findSceneIdByNumber(db, projectId, input.scene_number).andThen((ctx) =>
    ResultAsync.fromPromise(
      (async () => {
        const [elRow] = await db
          .insert(breakdownElements)
          .values({
            projectId,
            category: cat,
            name: input.name,
            description: null,
          })
          .onConflictDoUpdate({
            target: [
              breakdownElements.projectId,
              breakdownElements.category,
              breakdownElements.name,
            ],
            set: { updatedAt: new Date(), archivedAt: null },
          })
          .returning();
        if (!elRow) throw new Error("Insert element returned no rows");

        const [occRow] = await db
          .insert(breakdownOccurrences)
          .values({
            elementId: elRow.id,
            sceneId: ctx.sceneId,
            screenplayVersionId: ctx.screenplayVersionId,
            quantity: input.quantity ?? 1,
            cesareStatus: "accepted",
            source: "cesare",
          })
          .onConflictDoUpdate({
            target: [
              breakdownOccurrences.elementId,
              breakdownOccurrences.screenplayVersionId,
              breakdownOccurrences.sceneId,
            ],
            set: {
              quantity: input.quantity ?? 1,
              cesareStatus: "accepted",
              updatedAt: new Date(),
            },
          })
          .returning();
        if (!occRow) throw new Error("Insert occurrence returned no rows");

        return {
          elementId: elRow.id,
          occurrenceId: occRow.id,
          toast_message: `Aggiunto «${input.name}» (${cat}) a sc.${input.scene_number}`,
        };
      })(),
      (e) =>
        new CesareError(
          `executeTagElement: ${e instanceof Error ? e.message : String(e)}`,
        ),
    ),
  );
};

const executeSetGhostStatus = (
  input: GhostInput,
  db: Db,
  projectId: string,
  status: "accepted" | "ignored",
): ResultAsync<{ ok: true; toast_message: string }, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const [row] = await db
        .select({
          projectId: breakdownElements.projectId,
          name: breakdownElements.name,
        })
        .from(breakdownOccurrences)
        .innerJoin(
          breakdownElements,
          eq(breakdownOccurrences.elementId, breakdownElements.id),
        )
        .where(eq(breakdownOccurrences.id, input.occurrence_id))
        .limit(1);
      if (!row) throw new Error(`Occurrence ${input.occurrence_id} not found`);
      if (row.projectId !== projectId)
        throw new Error("Occurrence does not belong to this project");
      await db
        .update(breakdownOccurrences)
        .set({ cesareStatus: status, updatedAt: new Date() })
        .where(eq(breakdownOccurrences.id, input.occurrence_id));
      const verb = status === "accepted" ? "Confermato" : "Scartato";
      return {
        ok: true as const,
        toast_message: `${verb} «${row.name}»`,
      };
    })(),
    (e) =>
      new CesareError(
        `executeSetGhostStatus: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

// TODO(spec-30b): expose a per-project Settings UI that lets the line producer
// edit `production_rates` entries (default day rates, fringes, currency). The
// rates already drive `estimateSceneCost`; today they can only be tuned via SQL.
const loadRatesForCesare = (
  db: Db,
  projectId: string,
): ResultAsync<ProductionRates, CesareError> =>
  ResultAsync.fromPromise(
    db
      .select({ key: productionRates.key, value: productionRates.value })
      .from(productionRates)
      .where(eq(productionRates.projectId, projectId)),
    (e) =>
      new CesareError(
        `loadRatesForCesare: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).map((rows) => {
    const overrides: Partial<ProductionRates> = {};
    for (const r of rows) {
      const v = Number(r.value);
      if (Number.isFinite(v)) (overrides as Record<string, number>)[r.key] = v;
    }
    return { ...DEFAULT_PRODUCTION_RATES, ...overrides };
  });

const executeEstimateSceneCost = (
  input: SceneNumberInput,
  db: Db,
  projectId: string,
): ResultAsync<
  {
    total: number;
    difficulty: number;
    lines: Array<{ category: string; description: string; amount: number }>;
    notes: string[];
  },
  CesareError
> =>
  findSceneIdByNumber(db, projectId, input.scene_number).andThen((ctx) =>
    ResultAsync.fromPromise(
      (async () => {
        const [scene] = await db
          .select({
            id: scenes.id,
            number: scenes.number,
            intExt: scenes.intExt,
            timeOfDay: scenes.timeOfDay,
            characterNames: scenes.characterNames,
          })
          .from(scenes)
          .where(eq(scenes.id, ctx.sceneId))
          .limit(1);
        if (!scene) throw new Error(`Scene ${input.scene_number} disappeared`);
        const elementRows = await db
          .select({
            category: breakdownElements.category,
            name: breakdownElements.name,
          })
          .from(breakdownElements)
          .innerJoin(
            breakdownOccurrences,
            eq(breakdownOccurrences.elementId, breakdownElements.id),
          )
          .where(
            and(
              eq(breakdownElements.projectId, projectId),
              eq(breakdownOccurrences.sceneId, scene.id),
              isNull(breakdownElements.archivedAt),
            ),
          );
        const elementsByCategory: Record<string, string[]> = {};
        for (const row of elementRows) {
          const list = elementsByCategory[row.category] ?? [];
          list.push(row.name);
          elementsByCategory[row.category] = list;
        }
        return { scene, elementsByCategory };
      })(),
      (e) =>
        new CesareError(
          `executeEstimateSceneCost: ${e instanceof Error ? e.message : String(e)}`,
        ),
    ).andThen(({ scene, elementsByCategory }) =>
      loadRatesForCesare(db, projectId).map((rates) =>
        estimateSceneCost(
          {
            sceneNumber: scene.number,
            intExt: scene.intExt,
            timeOfDay: scene.timeOfDay,
            characters: scene.characterNames,
            elementsByCategory,
            estimatedShootHours: 8,
          },
          rates,
        ),
      ),
    ),
  );

const executeAddSceneToBudget = (
  input: SceneNumberInput,
  db: Db,
  projectId: string,
): ResultAsync<{ linesAdded: number; toast_message: string }, CesareError> =>
  executeEstimateSceneCost(input, db, projectId).andThen((est) =>
    ResultAsync.fromPromise(
      (async () => {
        const [budget] = await db
          .select({ id: budgets.id, status: budgets.status })
          .from(budgets)
          .where(eq(budgets.projectId, projectId))
          .limit(1);
        if (!budget)
          throw new Error("Budget non ancora generato per questo progetto");
        if (budget.status === "locked")
          throw new Error("Il budget è lockato e non accetta nuove righe");
        const existing = await db
          .select({ sortOrder: budgetLines.sortOrder })
          .from(budgetLines)
          .where(eq(budgetLines.budgetId, budget.id));
        let maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1);
        let added = 0;
        for (const line of est.lines) {
          if (line.amount <= 0) continue;
          maxSort += 1;
          const topSheet =
            line.category === "cast"
              ? "above_the_line"
              : line.category === "crew"
                ? "crew"
                : "production";
          await db.insert(budgetLines).values({
            budgetId: budget.id,
            topSheet,
            name: `Sc.${input.scene_number} — ${line.description}`,
            costType: "flat",
            quantity: "1",
            rate: String(line.amount),
            sortOrder: maxSort,
          });
          added += 1;
        }
        return {
          linesAdded: added,
          toast_message: `Aggiunte ${added} righe al budget per sc.${input.scene_number}`,
        };
      })(),
      (e) =>
        new CesareError(
          `executeAddSceneToBudget: ${e instanceof Error ? e.message : String(e)}`,
        ),
    ),
  );

export const executeBreakdownTool = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
): ResultAsync<ToolResult, CesareError> => {
  const successResult = (id: string, payload: unknown): ToolResult => ({
    type: "tool_result",
    tool_use_id: id,
    content: JSON.stringify(payload),
  });

  if (block.name === "tag_element") {
    return executeTagElement(block.input as TagElementInput, db, projectId).map(
      (r) => successResult(block.id, r),
    );
  }
  if (block.name === "accept_ghost") {
    return executeSetGhostStatus(
      block.input as GhostInput,
      db,
      projectId,
      "accepted",
    ).map((r) => successResult(block.id, r));
  }
  if (block.name === "reject_ghost") {
    return executeSetGhostStatus(
      block.input as GhostInput,
      db,
      projectId,
      "ignored",
    ).map((r) => successResult(block.id, r));
  }
  if (block.name === "estimate_scene_cost") {
    return executeEstimateSceneCost(
      block.input as SceneNumberInput,
      db,
      projectId,
    ).map((r) => successResult(block.id, r));
  }
  if (block.name === "add_to_budget") {
    return executeAddSceneToBudget(
      block.input as SceneNumberInput,
      db,
      projectId,
    ).map((r) => successResult(block.id, r));
  }
  const readFallthrough = tryExecuteReadTool(block, db, projectId);
  if (readFallthrough) return readFallthrough;
  return okAsync(
    successResult(block.id, { error: `Unknown breakdown tool: ${block.name}` }),
  );
};

export const executeTool = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
  fallbackRequirementId: string | null,
): ResultAsync<ToolResult, CesareError> => {
  const successResult = (id: string, content: string): ToolResult => ({
    type: "tool_result",
    tool_use_id: id,
    content,
  });

  if (block.name === "search_places") {
    const input = block.input as SearchPlacesInput;
    return executeSearchPlaces(input).map((places) =>
      successResult(block.id, JSON.stringify(places)),
    );
  }

  if (block.name === "add_candidate") {
    const raw = block.input as AddCandidateInput;
    // If Cesare omits requirement_id or passes a placeholder, use the context one
    const input: AddCandidateInput = {
      ...raw,
      requirement_id: raw.requirement_id || fallbackRequirementId || "",
    };
    if (!input.requirement_id) {
      return okAsync(
        successResult(
          block.id,
          JSON.stringify({
            error:
              "requirement_id missing — cannot add candidate without a selected location requirement",
          }),
        ),
      );
    }
    return executeAddCandidate(input, db, projectId).map((result) =>
      successResult(block.id, JSON.stringify(result)),
    );
  }

  const readFallthrough = tryExecuteReadTool(block, db, projectId);
  if (readFallthrough) return readFallthrough;

  return okAsync(
    successResult(
      block.id,
      JSON.stringify({ error: `Unknown tool: ${block.name}` }),
    ),
  );
};

// ─── Tool loop ────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string | unknown[];
}

interface AnthropicResponse {
  content: unknown[];
  stop_reason?: string | null;
}

interface AnthropicClient {
  messages: {
    create(args: Record<string, unknown>): Promise<AnthropicResponse>;
  };
}

export const runToolLoop = (
  client: AnthropicClient,
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  fallbackRequirementId: string | null = null,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    client,
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    tools: [
      ...CESARE_LOCATION_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    executor: (block, dbArg, projectIdArg) =>
      executeTool(block, dbArg, projectIdArg, fallbackRequirementId),
  });

export const runScreenplayToolLoop = (
  client: AnthropicClient,
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  forcedFirstTool?: string,
): ResultAsync<string, CesareError> => {
  return runGenericToolLoop({
    client,
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    forcedFirstTool,
    tools: [
      ...CESARE_SCREENPLAY_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    executor: (block, dbArg, projectIdArg) => {
      const readFallthrough = tryExecuteReadTool(block, dbArg, projectIdArg);
      if (readFallthrough) return readFallthrough;
      return executeScreenplayTool(block, dbArg, projectIdArg);
    },
  });
};

export const runDocumentToolLoop = (
  client: AnthropicClient,
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  docContext: DocumentContext,
  userIdFallback: string | null = null,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    client,
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    tools: [
      ...CESARE_DOCUMENT_TOOLS,
      ...CESARE_DOCUMENT_GEN_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    executor: (block, dbArg, projectIdArg) => {
      const readFallthrough = tryExecuteReadTool(block, dbArg, projectIdArg);
      if (readFallthrough) return readFallthrough;
      if (isDocumentGenToolName(block.name)) {
        return executeDocumentGenTool(
          block,
          dbArg,
          projectIdArg,
          userIdFallback,
        );
      }
      return executeDocumentTool(block, dbArg, docContext);
    },
  });

export const runBreakdownToolLoop = (
  client: AnthropicClient,
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    client,
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    tools: [
      ...CESARE_BREAKDOWN_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    executor: (block, dbArg, projectIdArg) =>
      executeBreakdownTool(block, dbArg, projectIdArg),
  });

export const runScheduleToolLoop = (
  client: AnthropicClient,
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  scheduleContext: ScheduleToolContext,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    client,
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    tools: [
      ...CESARE_SCHEDULE_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    executor: (block, dbArg, projectIdArg) => {
      const readFallthrough = tryExecuteReadTool(block, dbArg, projectIdArg);
      if (readFallthrough) return readFallthrough;
      return executeScheduleTool(block, dbArg, scheduleContext);
    },
  });

export const runShootingPlanToolLoop = (
  client: AnthropicClient,
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  shootingPlanContext: ShootingPlanToolContext,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    client,
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    tools: [
      ...CESARE_SHOOTING_PLAN_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    executor: (block, dbArg, projectIdArg) => {
      const readFallthrough = tryExecuteReadTool(block, dbArg, projectIdArg);
      if (readFallthrough) return readFallthrough;
      return executeShootingPlanTool(block, dbArg, shootingPlanContext);
    },
  });

interface RunToolLoopArgs {
  client: AnthropicClient;
  systemPrompt: string | readonly unknown[];
  messages: Message[];
  db: Db;
  projectId: string;
  model: string;
  tools: readonly unknown[];
  executor: (
    block: ToolUseBlock,
    db: Db,
    projectId: string,
  ) => ResultAsync<ToolResult, CesareError>;
  /** When set, forces the FIRST iteration to use a specific tool. Subsequent
   *  iterations fall back to "auto" so the model can choose follow-up tools
   *  (e.g. a read_* after the mandated propose_*). Used by the semantic
   *  intent classifier to make propose_* deterministic. */
  forcedFirstTool?: string;
}

const runGenericToolLoop = (
  args: RunToolLoopArgs,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    (async (): Promise<string> => {
      const MAX_ITERATIONS = 5;
      const currentMessages: Message[] = [...args.messages];
      const textAccumulator: string[] = [];
      let toolsExecuted = 0;

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        // First iteration honours `forcedFirstTool` from the semantic
        // intent classifier: when the user's request is unambiguously a
        // macro rewrite / rename / micro-edit, the classifier mandates the
        // exact tool the model MUST call. Without forcing, the model often
        // produces the rewrite inline in chat and silently skips the tool.
        // After the first turn we relax to "auto" so follow-up reads /
        // confirmations can flow normally.
        const toolChoice =
          i === 0 && args.forcedFirstTool
            ? ({ type: "tool", name: args.forcedFirstTool } as const)
            : ({ type: "auto" } as const);
        const response = await args.client.messages.create({
          model: args.model,
          max_tokens: 1500,
          system: args.systemPrompt,
          messages: currentMessages,
          tools: args.tools,
          tool_choice: toolChoice,
        });

        const toolBlocks = response.content.filter(isToolUseBlock);
        const textBlocks = response.content.filter(
          (b): b is { type: "text"; text: string } =>
            typeof b === "object" &&
            b !== null &&
            (b as { type: string }).type === "text",
        );

        // Collect any text in this turn
        for (const tb of textBlocks) {
          if (tb.text.trim()) {
            textAccumulator.push(tb.text.trim());
          }
        }

        // If no tool use, we're done
        if (response.stop_reason !== "tool_use" || toolBlocks.length === 0) {
          break;
        }

        // Execute all tools in this turn
        const toolResults: ToolResult[] = [];
        for (const block of toolBlocks) {
          const result = await args.executor(block, args.db, args.projectId);
          if (result.isErr()) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({ error: result.error.message }),
            });
          } else {
            toolsExecuted += 1;
            toolResults.push(result.value);
            // Side-channel: surface blocking proposals to the client by
            // emitting an invisible HTML marker. CesareSheet parses these and
            // dispatches a DOM event the canvas listens to.
            if (block.name === "propose_blocking_for_scene") {
              try {
                const payload = JSON.parse(result.value.content);
                if (
                  payload &&
                  typeof payload === "object" &&
                  !("error" in payload)
                ) {
                  textAccumulator.push(
                    `<!--ohw:blocking-proposal:${JSON.stringify(payload)}-->`,
                  );
                }
              } catch {
                // ignore malformed payloads — the marker is best-effort
              }
            }
            // Side-channel: rewrite_scene embeds its marker inside the tool
            // result JSON (field `marker`). Extract it here and push it to
            // the text accumulator so the CesareSheet can parse it and fire
            // the `ohw:cesare:rewrite-scene` DOM event to the editor.
            if (block.name === "rewrite_scene") {
              try {
                const payload = JSON.parse(result.value.content) as unknown;
                if (
                  payload &&
                  typeof payload === "object" &&
                  "marker" in (payload as Record<string, unknown>) &&
                  typeof (payload as Record<string, unknown>)["marker"] ===
                    "string"
                ) {
                  textAccumulator.push(
                    (payload as Record<string, unknown>)["marker"] as string,
                  );
                }
              } catch {
                // ignore malformed payloads — the marker is best-effort
              }
            }
          }
        }

        // Append assistant message with tool_use blocks, then user message with tool_results
        currentMessages.push({
          role: "assistant",
          content: response.content,
        });
        currentMessages.push({
          role: "user",
          content: toolResults,
        });
      }

      // Append an invisible marker so the client can tell whether real
      // mutations happened. The MessageBubble's stripToolCalls + comment
      // stripping hides this from the rendered text.
      const marker = `<!--ohw:tools=${toolsExecuted}-->`;
      return `${textAccumulator.join("\n\n")}\n${marker}`;
    })(),
    (e) =>
      new CesareError(
        `Tool loop failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

// ─── Budget tool definitions ──────────────────────────────────────────────────

const BUDGET_LINE_FIELDS = ["rate", "quantity", "actual", "notes"] as const;
type BudgetLineField = (typeof BUDGET_LINE_FIELDS)[number];

export const CESARE_BUDGET_TOOLS = [
  {
    name: "update_budget_line",
    description:
      "Aggiorna un singolo campo di una riga del budget esistente. " +
      "Campi consentiti: 'rate' (importo unitario in euro), 'quantity' (numero di unita), " +
      "'actual' (spesa effettiva consuntivata in euro), 'notes' (testo libero). " +
      "Usa questo tool quando l'utente chiede di modificare una voce specifica. " +
      "Il line_id deve essere quello di una riga esistente nel budget del progetto corrente.",
    input_schema: {
      type: "object" as const,
      properties: {
        line_id: { type: "string", description: "UUID della riga budget" },
        field: {
          type: "string",
          enum: ["rate", "quantity", "actual", "notes"],
          description: "Campo da aggiornare",
        },
        value: {
          description:
            "Nuovo valore. Numero per rate/quantity/actual, stringa per notes. " +
            "Passa null per azzerare actual/rate/quantity.",
        },
      },
      required: ["line_id", "field", "value"],
    },
  },
  {
    name: "add_budget_line",
    description:
      "Aggiunge una nuova voce di costo a un top sheet esistente. " +
      "I top sheet ammessi sono: 'above_the_line', 'production', 'crew', 'post_production', 'contingency'. " +
      "Usa questo tool quando l'utente chiede di inserire una voce che manca (es. 'aggiungi catering').",
    input_schema: {
      type: "object" as const,
      properties: {
        top_sheet: {
          type: "string",
          enum: [
            "above_the_line",
            "production",
            "crew",
            "post_production",
            "contingency",
          ],
          description: "Categoria top sheet a cui appartiene la nuova voce",
        },
        description: {
          type: "string",
          description: "Nome/descrizione della voce",
        },
        rate: { type: "number", description: "Importo unitario in euro" },
        quantity: {
          type: "number",
          description: "Numero di unita (default 1)",
        },
        linked_category: {
          type: "string",
          description:
            "Categoria di breakdown collegata (opzionale, es. 'props', 'vehicles', 'locations')",
        },
      },
      required: ["top_sheet", "description", "rate"],
    },
  },
  {
    name: "redistribute_topsheet",
    description:
      "Sposta un importo in euro da un top sheet a un altro. " +
      "Strategia: abbassa il rate*quantity della riga piu costosa di 'from_top_sheet' " +
      "fino a ridurre l'allocazione di 'amount' euro (riducendo il rate, mai sotto zero). " +
      "Poi aggiunge una riga 'Contingenza riallocata da <from_top_sheet>' nel 'to_top_sheet' " +
      "(o incrementa una riga simile preesistente). " +
      "Limite: se la riga piu grande non basta a coprire 'amount', il tool ritorna un errore e Cesare deve proporre un piano in piu step. " +
      "Non tocca righe 'cast' o 'crew' a livello di risorsa (budgetCast/budgetCrew): opera solo su budget_lines.",
    input_schema: {
      type: "object" as const,
      properties: {
        from_top_sheet: {
          type: "string",
          enum: [
            "above_the_line",
            "production",
            "crew",
            "post_production",
            "contingency",
          ],
        },
        to_top_sheet: {
          type: "string",
          enum: [
            "above_the_line",
            "production",
            "crew",
            "post_production",
            "contingency",
          ],
        },
        amount: { type: "number", description: "Importo in euro da spostare" },
      },
      required: ["from_top_sheet", "to_top_sheet", "amount"],
    },
  },
  {
    name: "analyze_variance",
    description:
      "Report deterministico (read-only, niente inferenza AI) sullo stato del budget: " +
      "top 3 righe piu sopra-budget (actual > rate*quantity), " +
      "top 3 righe piu sotto-budget (actual < rate*quantity con consuntivo presente), " +
      "top sheet con residuo negativo. " +
      "Usa questo tool quando l'utente chiede 'analizza il budget', 'dove sto sforando', 'a che punto siamo'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "mark_line_actual",
    description:
      "Imposta l'importo effettivamente speso ('actual') su una riga budget per la riconciliazione. " +
      "Usa questo tool quando l'utente comunica una spesa reale (es. 'la trattoria e costata 320 euro').",
    input_schema: {
      type: "object" as const,
      properties: {
        line_id: { type: "string", description: "UUID della riga budget" },
        actual_amount: {
          type: "number",
          description: "Importo speso in euro (>= 0)",
        },
      },
      required: ["line_id", "actual_amount"],
    },
  },
  {
    name: "set_budget_cap",
    description:
      "Imposta un tetto di spesa (cap) per il progetto. " +
      "Scope 'global' = tetto complessivo del budget. " +
      "Scope 'topsheet' = tetto per uno specifico top sheet (es. cast, production, post_production). " +
      "Usa questo tool quando l'utente chiede 'non superare X' o 'il cast non puo costare piu di Y'.",
    input_schema: {
      type: "object" as const,
      properties: {
        scope: {
          oneOf: [
            {
              type: "object",
              properties: { kind: { type: "string", enum: ["global"] } },
              required: ["kind"],
            },
            {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["topsheet"] },
                top_sheet: {
                  type: "string",
                  enum: [
                    "above_the_line",
                    "production",
                    "crew",
                    "post_production",
                    "contingency",
                  ],
                },
              },
              required: ["kind", "top_sheet"],
            },
          ],
        },
        amount_cents: {
          type: "number",
          description: "Tetto in centesimi (es. 5000000 per €50.000).",
        },
      },
      required: ["scope", "amount_cents"],
    },
  },
  {
    name: "evaluate_against_cap",
    description:
      "Legge i cap correnti (globale + per topsheet) e li confronta con l'allocazione di budget effettiva. " +
      "Ritorna residuo e top sheet che sforano. Pure read — non muta nulla. " +
      "Usa questo tool per 'siamo dentro budget?' o 'quanto rimane?'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "propose_excessive_lines_flags",
    description:
      "Analizza le voci di budget e segnala quelle anomale: >150% della media della loro categoria. " +
      "Ritorna la lista flaggata — NON muta nulla. L'utente decide se intervenire. " +
      "Usa questo tool per 'ci sono voci eccessive?' o 'cosa costa troppo?'.",
    input_schema: {
      type: "object" as const,
      properties: {
        threshold_ratio: {
          type: "number",
          description: "Soglia opzionale (default 1.5 = 150% della media)",
        },
      },
      required: [],
    },
  },
  {
    name: "propose_missing_lines",
    description:
      "Analizza il breakdown delle scene richieste e propone voci budget potenzialmente mancanti. " +
      "Ritorna la lista delle categorie scoperte con nomi e stime di default — NON muta nulla. " +
      "Usa questo tool quando l'utente chiede 'cosa manca nel budget?' o 'verifica copertura'.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_ids: {
          type: "array",
          items: { type: "string" },
          description:
            "UUID delle scene da analizzare. Omesso = analizza l'intero progetto.",
        },
      },
      required: [],
    },
  },
] as const;

// ─── Budget tool executors ────────────────────────────────────────────────────
//
// These executors run inside the agent loop and apply mutations directly via
// Drizzle. We intentionally bypass the corresponding `createServerFn` wrappers
// because the agent loop is already running inside a `withProjectAccess`
// pipeline (see cesare.server.ts -> handleAskCesare), so the project scope and
// permission are guaranteed at this point. We still verify that the target
// budget line belongs to the current project to defend against hallucinated ids.

type TopSheet = (typeof TOP_SHEETS)[number];

interface UpdateBudgetLineInput {
  line_id: string;
  field: BudgetLineField;
  value: unknown;
}

interface BudgetLineLite {
  id: string;
  budgetId: string;
  topSheet: string;
  name: string;
  rate: string | null;
  quantity: string | null;
  actual: string | null;
}

const findBudgetForProject = async (
  db: Db,
  projectId: string,
): Promise<{ id: string; status: string } | null> => {
  const [row] = await db
    .select({ id: budgets.id, status: budgets.status })
    .from(budgets)
    .where(eq(budgets.projectId, projectId))
    .limit(1);
  return row ?? null;
};

const findBudgetLineForProject = async (
  db: Db,
  lineId: string,
  projectId: string,
): Promise<BudgetLineLite | null> => {
  const [row] = await db
    .select({
      id: budgetLines.id,
      budgetId: budgetLines.budgetId,
      topSheet: budgetLines.topSheet,
      name: budgetLines.name,
      rate: budgetLines.rate,
      quantity: budgetLines.quantity,
      actual: budgetLines.actual,
    })
    .from(budgetLines)
    .innerJoin(budgets, eq(budgetLines.budgetId, budgets.id))
    .where(and(eq(budgetLines.id, lineId), eq(budgets.projectId, projectId)))
    .limit(1);
  return row ?? null;
};

export const executeUpdateBudgetLine = (
  input: UpdateBudgetLineInput,
  db: Db,
  projectId: string,
): ResultAsync<
  { id: string; field: BudgetLineField; value: unknown },
  CesareError
> =>
  ResultAsync.fromPromise(
    (async () => {
      if (!BUDGET_LINE_FIELDS.includes(input.field)) {
        throw new Error(`Field not allowed: ${input.field}`);
      }
      const line = await findBudgetLineForProject(db, input.line_id, projectId);
      if (!line) {
        throw new Error(
          `Budget line ${input.line_id} not found or not in current project`,
        );
      }
      const budget = await findBudgetForProject(db, projectId);
      if (budget?.status === "locked") {
        throw new Error("Budget is locked");
      }

      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.field === "notes") {
        set.notes = input.value === null ? null : String(input.value ?? "");
      } else {
        if (input.value === null || input.value === undefined) {
          set[input.field] = null;
        } else {
          const n = Number(input.value);
          if (!Number.isFinite(n) || n < 0) {
            throw new Error(
              `Invalid numeric value for ${input.field}: ${String(input.value)}`,
            );
          }
          set[input.field] = String(n);
        }
      }

      await db
        .update(budgetLines)
        .set(set)
        .where(eq(budgetLines.id, input.line_id));

      return { id: input.line_id, field: input.field, value: input.value };
    })(),
    (e) =>
      new CesareError(
        `executeUpdateBudgetLine failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface AddBudgetLineInput {
  top_sheet: TopSheet;
  description: string;
  rate: number;
  quantity?: number;
  linked_category?: string;
}

export const executeAddBudgetLine = (
  input: AddBudgetLineInput,
  db: Db,
  projectId: string,
): ResultAsync<{ id: string; name: string; topSheet: string }, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      if (!TOP_SHEETS.includes(input.top_sheet)) {
        throw new Error(`Unknown top_sheet: ${input.top_sheet}`);
      }
      const budget = await findBudgetForProject(db, projectId);
      if (!budget) {
        throw new Error(
          "Budget not yet generated for this project - cannot add a line",
        );
      }
      if (budget.status === "locked") throw new Error("Budget is locked");

      const qty = input.quantity ?? 1;
      const rate = input.rate;
      if (!Number.isFinite(qty) || qty < 0) {
        throw new Error(`Invalid quantity: ${qty}`);
      }
      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error(`Invalid rate: ${rate}`);
      }

      const existing = await db
        .select({ sortOrder: budgetLines.sortOrder })
        .from(budgetLines)
        .where(eq(budgetLines.budgetId, budget.id));
      const maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1);

      const [inserted] = await db
        .insert(budgetLines)
        .values({
          budgetId: budget.id,
          topSheet: input.top_sheet,
          name: input.description,
          costType: "flat",
          quantity: String(qty),
          rate: String(rate),
          actual: null,
          notes: null,
          linkedElementId: null,
          linkedCategory: input.linked_category ?? null,
          sortOrder: maxSort + 1,
        })
        .returning({
          id: budgetLines.id,
          name: budgetLines.name,
          topSheet: budgetLines.topSheet,
        });

      if (!inserted) throw new Error("Insert returned no rows");
      return inserted;
    })(),
    (e) =>
      new CesareError(
        `executeAddBudgetLine failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface RedistributeInput {
  from_top_sheet: TopSheet;
  to_top_sheet: TopSheet;
  amount: number;
}

interface RedistributeResult {
  fromLine: { id: string; name: string; oldRate: number; newRate: number };
  toLine: { id: string; name: string; rate: number };
  movedAmount: number;
}

export const executeRedistributeTopsheet = (
  input: RedistributeInput,
  db: Db,
  projectId: string,
): ResultAsync<RedistributeResult, CesareError> =>
  ResultAsync.fromPromise(
    (async (): Promise<RedistributeResult> => {
      if (input.amount <= 0) throw new Error("amount must be > 0");
      if (input.from_top_sheet === input.to_top_sheet) {
        throw new Error("from_top_sheet and to_top_sheet must differ");
      }
      const budget = await findBudgetForProject(db, projectId);
      if (!budget) throw new Error("Budget not yet generated");
      if (budget.status === "locked") throw new Error("Budget is locked");

      const candidates = await db
        .select({
          id: budgetLines.id,
          name: budgetLines.name,
          rate: budgetLines.rate,
          quantity: budgetLines.quantity,
        })
        .from(budgetLines)
        .where(
          and(
            eq(budgetLines.budgetId, budget.id),
            eq(budgetLines.topSheet, input.from_top_sheet),
          ),
        );
      if (candidates.length === 0) {
        throw new Error(`No lines in ${input.from_top_sheet} to draw from`);
      }
      const scored = candidates
        .map((l) => ({
          ...l,
          rateNum: l.rate !== null ? Number(l.rate) : 0,
          qtyNum: l.quantity !== null ? Number(l.quantity) : 1,
        }))
        .map((l) => ({ ...l, total: l.rateNum * l.qtyNum }))
        .sort((a, b) => b.total - a.total);

      const top = scored[0]!;
      if (top.total < input.amount) {
        throw new Error(
          `Largest line in ${input.from_top_sheet} ("${top.name}") allocates only ${top.total.toFixed(
            2,
          )} euro - cannot move ${input.amount.toFixed(2)} euro in one step. Propose a multi-step plan.`,
        );
      }

      const reduction = input.amount;
      const newTotalForFrom = top.total - reduction;
      const qtyForFrom = top.qtyNum > 0 ? top.qtyNum : 1;
      const newRate = newTotalForFrom / qtyForFrom;

      await db
        .update(budgetLines)
        .set({ rate: String(newRate), updatedAt: new Date() })
        .where(eq(budgetLines.id, top.id));

      const reallocName = `Contingenza riallocata da ${input.from_top_sheet}`;
      const [existingTarget] = await db
        .select({
          id: budgetLines.id,
          name: budgetLines.name,
          rate: budgetLines.rate,
          quantity: budgetLines.quantity,
        })
        .from(budgetLines)
        .where(
          and(
            eq(budgetLines.budgetId, budget.id),
            eq(budgetLines.topSheet, input.to_top_sheet),
            eq(budgetLines.name, reallocName),
          ),
        )
        .limit(1);

      let toLineId: string;
      let toLineName: string;
      let toRate: number;
      if (existingTarget) {
        const prev =
          existingTarget.rate !== null ? Number(existingTarget.rate) : 0;
        const prevQty =
          existingTarget.quantity !== null
            ? Number(existingTarget.quantity)
            : 1;
        const newRateTo = prev + input.amount / Math.max(prevQty, 1);
        await db
          .update(budgetLines)
          .set({ rate: String(newRateTo), updatedAt: new Date() })
          .where(eq(budgetLines.id, existingTarget.id));
        toLineId = existingTarget.id;
        toLineName = existingTarget.name;
        toRate = newRateTo;
      } else {
        const existing = await db
          .select({ sortOrder: budgetLines.sortOrder })
          .from(budgetLines)
          .where(eq(budgetLines.budgetId, budget.id));
        const maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1);
        const [inserted] = await db
          .insert(budgetLines)
          .values({
            budgetId: budget.id,
            topSheet: input.to_top_sheet,
            name: reallocName,
            costType: "flat",
            quantity: "1",
            rate: String(input.amount),
            actual: null,
            notes: `Spostato automaticamente da ${input.from_top_sheet} su richiesta dell'utente`,
            linkedElementId: null,
            linkedCategory: null,
            sortOrder: maxSort + 1,
          })
          .returning({
            id: budgetLines.id,
            name: budgetLines.name,
          });
        if (!inserted) throw new Error("Insert returned no rows");
        toLineId = inserted.id;
        toLineName = inserted.name;
        toRate = input.amount;
      }

      return {
        fromLine: {
          id: top.id,
          name: top.name,
          oldRate: top.rateNum,
          newRate,
        },
        toLine: { id: toLineId, name: toLineName, rate: toRate },
        movedAmount: input.amount,
      };
    })(),
    (e) =>
      new CesareError(
        `executeRedistributeTopsheet failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface VarianceReport {
  overBudget: Array<{
    id: string;
    name: string;
    topSheet: string;
    estimated: number;
    actual: number;
    delta: number;
  }>;
  underBudget: Array<{
    id: string;
    name: string;
    topSheet: string;
    estimated: number;
    actual: number;
    delta: number;
  }>;
  negativeResidualTopSheets: Array<{ topSheet: string; residual: number }>;
}

export const executeAnalyzeVariance = (
  db: Db,
  projectId: string,
): ResultAsync<VarianceReport, CesareError> =>
  ResultAsync.fromPromise(
    (async (): Promise<VarianceReport> => {
      const budget = await findBudgetForProject(db, projectId);
      if (!budget) {
        return {
          overBudget: [],
          underBudget: [],
          negativeResidualTopSheets: [],
        };
      }

      const lines = await db
        .select({
          id: budgetLines.id,
          name: budgetLines.name,
          topSheet: budgetLines.topSheet,
          rate: budgetLines.rate,
          quantity: budgetLines.quantity,
          actual: budgetLines.actual,
        })
        .from(budgetLines)
        .where(eq(budgetLines.budgetId, budget.id))
        .orderBy(desc(budgetLines.sortOrder));

      const withConsuntivo = lines
        .filter((l) => l.actual !== null)
        .map((l) => {
          const rate = l.rate !== null ? Number(l.rate) : 0;
          const qty = l.quantity !== null ? Number(l.quantity) : 0;
          const estimated = rate * qty;
          const actual = Number(l.actual);
          return {
            id: l.id,
            name: l.name,
            topSheet: l.topSheet,
            estimated,
            actual,
            delta: actual - estimated,
          };
        });

      const overBudget = [...withConsuntivo]
        .filter((l) => l.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 3);

      const underBudget = [...withConsuntivo]
        .filter((l) => l.delta < 0)
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 3);

      const residualByTopSheet: Record<string, number> = {};
      for (const l of lines) {
        const rate = l.rate !== null ? Number(l.rate) : 0;
        const qty = l.quantity !== null ? Number(l.quantity) : 0;
        const estimated = rate * qty;
        const spent = l.actual !== null ? Number(l.actual) : 0;
        const residual = estimated - spent;
        residualByTopSheet[l.topSheet] =
          (residualByTopSheet[l.topSheet] ?? 0) + residual;
      }
      const negativeResidualTopSheets = Object.entries(residualByTopSheet)
        .filter(([, v]) => v < 0)
        .map(([topSheet, residual]) => ({ topSheet, residual }))
        .sort((a, b) => a.residual - b.residual);

      return { overBudget, underBudget, negativeResidualTopSheets };
    })(),
    (e) =>
      new CesareError(
        `executeAnalyzeVariance failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface MarkLineActualInput {
  line_id: string;
  actual_amount: number;
}

export const executeMarkLineActual = (
  input: MarkLineActualInput,
  db: Db,
  projectId: string,
): ResultAsync<{ id: string; actual: number }, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      if (!Number.isFinite(input.actual_amount) || input.actual_amount < 0) {
        throw new Error(`Invalid actual_amount: ${input.actual_amount}`);
      }
      const line = await findBudgetLineForProject(db, input.line_id, projectId);
      if (!line) {
        throw new Error(
          `Budget line ${input.line_id} not found or not in current project`,
        );
      }
      const budget = await findBudgetForProject(db, projectId);
      if (budget?.status === "locked") throw new Error("Budget is locked");

      await db
        .update(budgetLines)
        .set({ actual: String(input.actual_amount), updatedAt: new Date() })
        .where(eq(budgetLines.id, input.line_id));

      return { id: input.line_id, actual: input.actual_amount };
    })(),
    (e) =>
      new CesareError(
        `executeMarkLineActual failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

// ─── set_budget_cap / evaluate_against_cap / excessive / missing ────────────

type CapScope = { kind: "global" } | { kind: "topsheet"; top_sheet: TopSheet };

interface SetBudgetCapInput {
  scope: CapScope;
  amount_cents: number;
}

const isValidTopSheet = (value: unknown): value is TopSheet =>
  typeof value === "string" &&
  (TOP_SHEETS as readonly string[]).includes(value);

export const executeSetBudgetCap = (
  input: SetBudgetCapInput,
  db: Db,
  projectId: string,
): ResultAsync<
  { id: string; topSheet: string | null; amountCents: number },
  CesareError
> =>
  ResultAsync.fromPromise(
    (async () => {
      if (!input.scope || typeof input.scope !== "object") {
        throw new Error("scope is required");
      }
      const kind = input.scope.kind;
      let topSheet: string | null;
      if (kind === "global") {
        topSheet = null;
      } else if (kind === "topsheet") {
        if (!isValidTopSheet(input.scope.top_sheet)) {
          throw new Error(
            `Unknown top_sheet: ${String(input.scope.top_sheet)}`,
          );
        }
        topSheet = input.scope.top_sheet;
      } else {
        throw new Error(`Unknown scope kind: ${String(kind)}`);
      }

      const amount = Math.trunc(input.amount_cents);
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`Invalid amount_cents: ${input.amount_cents}`);
      }

      const existing = await db
        .select()
        .from(budgetCaps)
        .where(
          and(
            eq(budgetCaps.projectId, projectId),
            topSheet === null
              ? isNull(budgetCaps.topSheet)
              : eq(budgetCaps.topSheet, topSheet),
          ),
        )
        .limit(1);

      if (existing[0]) {
        const [updated] = await db
          .update(budgetCaps)
          .set({ amountCents: amount, updatedAt: new Date() })
          .where(eq(budgetCaps.id, existing[0].id))
          .returning();
        return {
          id: updated!.id,
          topSheet: updated!.topSheet,
          amountCents: updated!.amountCents,
        };
      }

      const [inserted] = await db
        .insert(budgetCaps)
        .values({ projectId, topSheet, amountCents: amount })
        .returning();
      return {
        id: inserted!.id,
        topSheet: inserted!.topSheet,
        amountCents: inserted!.amountCents,
      };
    })(),
    (e) =>
      new CesareError(
        `executeSetBudgetCap failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

const collectIntelligenceLines = async (
  db: Db,
  budgetId: string,
): Promise<IntelligenceLine[]> => {
  const rows = await db
    .select({
      id: budgetLines.id,
      name: budgetLines.name,
      topSheet: budgetLines.topSheet,
      rate: budgetLines.rate,
      quantity: budgetLines.quantity,
      actual: budgetLines.actual,
      linkedCategory: budgetLines.linkedCategory,
    })
    .from(budgetLines)
    .where(eq(budgetLines.budgetId, budgetId));

  return rows.map((row) => {
    const rate = row.rate !== null ? Number(row.rate) : 0;
    const qty = row.quantity !== null ? Number(row.quantity) : 0;
    const actual = row.actual !== null ? Number(row.actual) : null;
    const effective = actual !== null ? actual : rate * qty;
    return {
      id: row.id,
      name: row.name,
      category: row.linkedCategory ?? row.topSheet,
      amountEuros: effective,
    };
  });
};

const spendByTopSheetCents = async (
  db: Db,
  budgetId: string,
): Promise<Array<{ topSheet: string; usedCents: number }>> => {
  const rows = await db
    .select({
      topSheet: budgetLines.topSheet,
      rate: budgetLines.rate,
      quantity: budgetLines.quantity,
      actual: budgetLines.actual,
    })
    .from(budgetLines)
    .where(eq(budgetLines.budgetId, budgetId));

  const totals = new Map<string, number>();
  for (const row of rows) {
    const rate = row.rate !== null ? Number(row.rate) : 0;
    const qty = row.quantity !== null ? Number(row.quantity) : 0;
    const actual = row.actual !== null ? Number(row.actual) : null;
    const effective = actual !== null ? actual : rate * qty;
    totals.set(
      row.topSheet,
      (totals.get(row.topSheet) ?? 0) + Math.round(effective * 100),
    );
  }
  return Array.from(totals.entries()).map(([topSheet, usedCents]) => ({
    topSheet,
    usedCents,
  }));
};

export const executeEvaluateAgainstCap = (
  db: Db,
  projectId: string,
): ResultAsync<CapEvaluation, CesareError> =>
  ResultAsync.fromPromise(
    (async (): Promise<CapEvaluation> => {
      const budget = await findBudgetForProject(db, projectId);
      const capRows = await db
        .select()
        .from(budgetCaps)
        .where(eq(budgetCaps.projectId, projectId));

      const capsInput = capRows.map((r) => ({
        topSheet: r.topSheet,
        amountCents: r.amountCents,
      }));

      const spend = budget ? await spendByTopSheetCents(db, budget.id) : [];
      return evaluateAgainstCap(capsInput, spend);
    })(),
    (e) =>
      new CesareError(
        `executeEvaluateAgainstCap failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface ExcessiveLinesInput {
  threshold_ratio?: number;
}

export const executeProposeExcessiveLines = (
  input: ExcessiveLinesInput,
  db: Db,
  projectId: string,
): ResultAsync<{ flagged: ReadonlyArray<ExcessiveLineFlag> }, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const budget = await findBudgetForProject(db, projectId);
      if (!budget) return { flagged: [] };
      const lines = await collectIntelligenceLines(db, budget.id);
      const threshold =
        typeof input.threshold_ratio === "number" &&
        Number.isFinite(input.threshold_ratio) &&
        input.threshold_ratio > 1
          ? input.threshold_ratio
          : 1.5;
      return { flagged: findExcessiveLines(lines, threshold) };
    })(),
    (e) =>
      new CesareError(
        `executeProposeExcessiveLines failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

interface MissingLinesInput {
  scene_ids?: ReadonlyArray<string>;
}

export const executeProposeMissingLines = (
  input: MissingLinesInput,
  db: Db,
  projectId: string,
): ResultAsync<{ missing: ReadonlyArray<MissingLineProposal> }, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const screenplay = await db
        .select({ id: screenplays.id })
        .from(screenplays)
        .where(eq(screenplays.projectId, projectId))
        .limit(1);
      if (!screenplay[0]) return { missing: [] };

      // Resolve scenes scope: explicit ids when present, else the whole project.
      const sceneIdsScope: string[] =
        input.scene_ids && input.scene_ids.length > 0
          ? [...input.scene_ids]
          : await db
              .select({ id: scenes.id })
              .from(scenes)
              .where(eq(scenes.screenplayId, screenplay[0].id))
              .then((rows) => rows.map((r) => r.id));

      if (sceneIdsScope.length === 0) return { missing: [] };

      const elementRows = await db
        .select({ category: breakdownElements.category })
        .from(breakdownOccurrences)
        .innerJoin(
          breakdownElements,
          eq(breakdownOccurrences.elementId, breakdownElements.id),
        )
        .where(inArray(breakdownOccurrences.sceneId, sceneIdsScope));

      const categoriesInScenes = Array.from(
        new Set(elementRows.map((r) => r.category as string)),
      );

      const budget = await findBudgetForProject(db, projectId);
      const coveredCategories: string[] = budget
        ? await db
            .select({ category: budgetLines.linkedCategory })
            .from(budgetLines)
            .where(eq(budgetLines.budgetId, budget.id))
            .then((rows) =>
              rows
                .map((r) => r.category)
                .filter((c): c is string => c !== null),
            )
        : [];

      return {
        missing: proposeMissingLines(categoriesInScenes, coveredCategories),
      };
    })(),
    (e) =>
      new CesareError(
        `executeProposeMissingLines failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

// ─── Budget tool router ───────────────────────────────────────────────────────

export const executeBudgetTool = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
): ResultAsync<ToolResult, CesareError> => {
  const ok = (content: string): ToolResult => ({
    type: "tool_result",
    tool_use_id: block.id,
    content,
  });

  if (block.name === "update_budget_line") {
    return executeUpdateBudgetLine(
      block.input as UpdateBudgetLineInput,
      db,
      projectId,
    ).map((r) => ok(JSON.stringify(r)));
  }

  if (block.name === "add_budget_line") {
    return executeAddBudgetLine(
      block.input as AddBudgetLineInput,
      db,
      projectId,
    ).map((r) => ok(JSON.stringify(r)));
  }

  if (block.name === "redistribute_topsheet") {
    return executeRedistributeTopsheet(
      block.input as RedistributeInput,
      db,
      projectId,
    ).map((r) => ok(JSON.stringify(r)));
  }

  if (block.name === "analyze_variance") {
    return executeAnalyzeVariance(db, projectId).map((r) =>
      ok(JSON.stringify(r)),
    );
  }

  if (block.name === "mark_line_actual") {
    return executeMarkLineActual(
      block.input as MarkLineActualInput,
      db,
      projectId,
    ).map((r) => ok(JSON.stringify(r)));
  }

  if (block.name === "set_budget_cap") {
    return executeSetBudgetCap(
      block.input as SetBudgetCapInput,
      db,
      projectId,
    ).map((r) => ok(JSON.stringify(r)));
  }

  if (block.name === "evaluate_against_cap") {
    return executeEvaluateAgainstCap(db, projectId).map((r) =>
      ok(JSON.stringify(r)),
    );
  }

  if (block.name === "propose_excessive_lines_flags") {
    return executeProposeExcessiveLines(
      block.input as ExcessiveLinesInput,
      db,
      projectId,
    ).map((r) => ok(JSON.stringify(r)));
  }

  if (block.name === "propose_missing_lines") {
    return executeProposeMissingLines(
      block.input as MissingLinesInput,
      db,
      projectId,
    ).map((r) => ok(JSON.stringify(r)));
  }

  const readFallthrough = tryExecuteReadTool(block, db, projectId);
  if (readFallthrough) return readFallthrough;

  return okAsync(
    ok(JSON.stringify({ error: `Unknown budget tool: ${block.name}` })),
  );
};

// ─── Budget tool loop ─────────────────────────────────────────────────────────

export const runBudgetToolLoop = (
  client: AnthropicClient,
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    client,
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    tools: [
      ...CESARE_BUDGET_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    executor: executeBudgetTool,
  });

// ─── Unified tool loop (spec 39) ──────────────────────────────────────────────
// Parameterised on a SkillExecutor from the registry instead of a page-specific
// executor. The SkillExecutor receives (block, db, projectId, access) — the
// extra `access` arg is forwarded from the server function context.

export const runUnifiedToolLoop = (
  client: AnthropicClient,
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  tools: readonly unknown[],
  executor: SkillExecutor,
  db: Db,
  projectId: string,
  access: ProjectAccess,
  model: string,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    client,
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    tools,
    executor: (block, dbArg, projectIdArg) =>
      executor(block, dbArg, projectIdArg, access),
  });
