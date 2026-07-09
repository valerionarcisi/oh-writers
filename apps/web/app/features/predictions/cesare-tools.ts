import {
  type Tool,
  tool,
  generateText,
  streamText,
  stepCountIs,
  jsonSchema,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { Effect } from "effect";
import { repairMojibake, buildWordDiffSegments } from "@oh-writers/utils";
import { z } from "zod";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { eq, and, desc, sql, isNull, inArray } from "drizzle-orm";
import { logger } from "~/server/logger";
import { aiTelemetry } from "~/server/langfuse-config";
import { commitOrAsk, isAsked } from "./auto-version.effect";
import {
  userRequestedNewVersion,
  userConfirmedOverwrite,
} from "./version-intent";
import {
  locationCandidates,
  locationPhotos,
  locationRequirements,
  locationRequirementScenes,
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
import type { CesareStreamEvent } from "./cesare-stream-events";
import {
  mappingForTool,
  entityRefForDomain,
  labelForDomain,
} from "./cesare-tool-entity-map";
import {
  estimateSceneCost,
  DEFAULT_PRODUCTION_RATES,
  type ProductionRates,
} from "@oh-writers/domain";
import type { Db } from "~/server/db";
import type { ProjectAccess } from "~/server/access";
import { callHaiku, extractText } from "~/features/ai";
import { fromResultAsync } from "~/server/effect/interop";
import type { SkillExecutor, AnthropicTool } from "./skills/types";
import { CesareError } from "./cesare.errors";
import {
  CESARE_SCHEDULE_TOOLS,
  createScheduleTools,
  executeScheduleTool,
  type ScheduleToolContext,
} from "./cesare-schedule-tools";
import {
  CESARE_SHOOTING_PLAN_TOOLS,
  createShootingPlanTools,
  executeShootingPlanTool,
  type ShootingPlanToolContext,
} from "./cesare-shooting-plan-tools";
import {
  CESARE_READ_TOOLS,
  createReadTools,
  tryExecuteReadTool,
} from "./cesare-read-tools";
import {
  CESARE_SCREENPLAY_TOOLS,
  createScreenplayTools,
  executeScreenplayTool,
} from "./cesare-screenplay-tools";
import {
  CESARE_DOCUMENT_GEN_TOOLS,
  createDocumentGenTools,
  executeDocumentGenTool,
  isDocumentGenToolName,
} from "./cesare-document-tools";
import {
  createMockAnthropicClient,
  createMockCesareModel,
} from "./_mocks/cesare-tool-loop.mock";

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
      "i `photo_names` ricevuti per quel place (fino a 3) così le foto vengono salvate. " +
      "Per ottenere il requirement_id senza chiederlo all'utente, usa " +
      "find_or_create_requirement_for_scene oppure list_location_requirements.",
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
  {
    name: "list_location_requirements",
    description:
      "Elenca i location requirement esistenti per il progetto, con scene collegate e " +
      "numero di candidati salvati. Usa questo tool PRIMA di add_candidate per scoprire " +
      "il requirement_id giusto invece di chiederlo all'utente.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: {
          type: "integer",
          minimum: 1,
          description:
            "Filtro opzionale: restituisci solo i requirement collegati a questa scena.",
        },
      },
    },
  },
  {
    name: "create_location_requirement",
    description:
      "Crea un nuovo location requirement collegato a una scena specifica. " +
      "Deriva nome / int_ext / time_of_day dallo slugline della scena. " +
      "Usa quando l'utente vuole aggiungere candidati per una scena che non ha " +
      "ancora un requirement aperto. Per il caso comune preferisci " +
      "find_or_create_requirement_for_scene (idempotente).",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: {
          type: "integer",
          minimum: 1,
          description:
            "Numero ordinale (1-based) della scena per cui creare il requirement.",
        },
        brief: {
          type: "string",
          description:
            "Descrizione sintetica (1-2 frasi) di cosa serve dalla location, da salvare in `description`.",
        },
      },
      required: ["scene_number"],
    },
  },
  {
    name: "find_or_create_requirement_for_scene",
    description:
      "Restituisce il requirement collegato alla scena indicata. Se non esiste, " +
      "lo crea automaticamente derivando i campi dallo slugline. Tool idempotente: " +
      "chiamarlo due volte sulla stessa scena restituisce lo stesso requirement_id. " +
      "È l'entry point canonico per 'aggiungo candidati per la scena N'.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: {
          type: "integer",
          minimum: 1,
          description: "Numero ordinale (1-based) della scena.",
        },
      },
      required: ["scene_number"],
    },
  },
] as const;

// ─── Location tools factory (AI SDK v5 format) ────────────────────────────────

export const createLocationTools = (db: Db, projectId: string) => ({
  search_places: tool({
    description:
      "Cerca luoghi reali (locali, edifici, parchi, strade, etc.) tramite Google Places. " +
      "Usa questo tool quando l'utente chiede di trovare location fisiche in una zona geografica.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Query di ricerca, es. 'trattoria Piane di Falerone' o 'edificio industriale Torino'",
        ),
      location_bias: z
        .string()
        .optional()
        .describe(
          "Città o zona geografica per restringere la ricerca, es. 'Piane di Falerone, FM'",
        ),
      max_results: z
        .number()
        .optional()
        .describe("Numero massimo di risultati (default 5, max 10)"),
    }),
    execute: async (input, _opts) => {
      const result = await executeSearchPlaces(input as SearchPlacesInput);
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  add_candidate: tool({
    description:
      "Aggiunge un candidato reale alla location requirement corrente. " +
      "Usa questo tool dopo search_places per salvare i risultati rilevanti. " +
      "IMPORTANTE: se il candidato viene da un risultato di search_places, passa SEMPRE " +
      "i `photo_names` ricevuti per quel place (fino a 3) così le foto vengono salvate.",
    inputSchema: z.object({
      requirement_id: z
        .string()
        .describe(
          "UUID del location requirement a cui aggiungere il candidato",
        ),
      name: z.string().describe("Nome del luogo"),
      address: z.string().optional().describe("Indirizzo completo"),
      lat: z.number().optional().describe("Latitudine"),
      lng: z.number().optional().describe("Longitudine"),
      notes: z
        .string()
        .optional()
        .describe(
          "Note sintetiche su perché questo candidato è rilevante per la scena",
        ),
      photo_names: z
        .array(z.string())
        .optional()
        .describe(
          "Nomi delle foto Google Places nel formato 'places/X/photos/Y' " +
            "(prendili dal campo `photos[].name` del risultato di search_places, max 3).",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeAddCandidate(
        input as AddCandidateInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  list_location_requirements: tool({
    description:
      "Elenca i location requirement esistenti per il progetto. Usa PRIMA di " +
      "add_candidate per scoprire il requirement_id giusto senza chiederlo all'utente.",
    inputSchema: z.object({
      scene_number: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "Filtro opzionale: restituisci solo i requirement collegati a questa scena.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeListLocationRequirements(
        input as ListLocationRequirementsInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  create_location_requirement: tool({
    description:
      "Crea un nuovo location requirement collegato a una scena. " +
      "Deriva nome / int_ext / time_of_day dallo slugline della scena.",
    inputSchema: z.object({
      scene_number: z
        .number()
        .int()
        .min(1)
        .describe("Numero ordinale (1-based) della scena."),
      brief: z
        .string()
        .optional()
        .describe(
          "Descrizione sintetica di cosa serve dalla location, salvata in `description`.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeCreateLocationRequirement(
        input as CreateLocationRequirementInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  find_or_create_requirement_for_scene: tool({
    description:
      "Restituisce il requirement collegato alla scena (lo crea se manca). " +
      "Idempotente. Entry point canonico per 'aggiungo candidati per la scena N'.",
    inputSchema: z.object({
      scene_number: z
        .number()
        .int()
        .min(1)
        .describe("Numero ordinale (1-based) della scena."),
    }),
    execute: async (input, _opts) => {
      const result = await executeFindOrCreateRequirementForScene(
        input as { scene_number: number },
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
});

export type LocationTools = ReturnType<typeof createLocationTools>;

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

// ─── Document tools factory (AI SDK v5 format) ────────────────────────────────

export const createDocumentTools = (
  db: Db,
  docContext: DocumentContext,
  userIdFallback: string | null = null,
  sessionId: string | null = null,
  userInstruction: string | null = null,
) => ({
  apply_text_edit: tool({
    description:
      "Sostituisce una stringa esatta nel documento attivo (soggetto / sinossi / scaletta / trattamento). " +
      "Usa questo tool quando l'utente chiede una modifica testuale puntuale, come 'cambia X in Y' o 'riscrivi questa frase'. " +
      "La stringa `find` deve essere un sottoesempio testuale ESATTO del documento, copia-incollalo letteralmente. " +
      "Se `find` non viene trovato, l'edit fallisce: non inventare il testo originale.",
    inputSchema: z.object({
      find: z
        .string()
        .describe(
          "Sottostringa esatta da cercare nel documento. Deve corrispondere carattere per carattere.",
        ),
      replace: z.string().describe("Nuovo testo che sostituirà `find`."),
    }),
    execute: async (input, _opts) => {
      const result = await executeApplyTextEdit(
        input as ApplyTextEditInput,
        db,
        docContext,
        userIdFallback,
        sessionId,
        userInstruction,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  expand_section: tool({
    description:
      "Trova la sezione del documento sotto un certo heading e la espande in 2-3 paragrafi più ricchi, " +
      "preservando voce narrativa, tono e beat principali. L'heading è identificato cercando una riga " +
      "che inizia con `#`, `##`, `###` o che combacia esattamente col titolo. " +
      "Usalo quando l'utente chiede 'espandi atto II', 'sviluppa la sezione X' o simili.",
    inputSchema: z.object({
      heading: z
        .string()
        .describe(
          "Titolo della sezione da espandere (es. 'Atto II', 'Primo atto', 'Conclusione'). " +
            "Confronto case-insensitive e tollerante a marker markdown.",
        ),
    }),
    execute: async (rawInput, _opts) => {
      const input = rawInput as { heading: string };
      const range = findSection(docContext.content, input.heading);
      const sectionText = range ? sliceSection(docContext.content, range) : "";
      const result = await generateAndReplaceSection(
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
        userIdFallback,
        sessionId,
        userInstruction,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  compress_section: tool({
    description:
      "Trova la sezione del documento sotto un certo heading e la comprime al numero di parole indicato, " +
      "mantenendo i beat chiave e la voce. Usalo quando l'utente chiede 'accorcia X', 'riassumi questa parte' " +
      "o quando una sezione è troppo lunga.",
    inputSchema: z.object({
      heading: z.string().describe("Titolo della sezione da comprimere."),
      target_words: z
        .number()
        .describe(
          "Numero di parole target. Tipicamente tra 80 e 300 a seconda del tipo di documento.",
        ),
    }),
    execute: async (rawInput, _opts) => {
      const input = rawInput as { heading: string; target_words: number };
      const range = findSection(docContext.content, input.heading);
      const sectionText = range ? sliceSection(docContext.content, range) : "";
      const result = await generateAndReplaceSection(
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
        userIdFallback,
        sessionId,
        userInstruction,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
});

export type DocumentTools = ReturnType<typeof createDocumentTools>;

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

// ─── Breakdown tools factory (AI SDK v5 format) ───────────────────────────────

export const createBreakdownTools = (db: Db, projectId: string) => ({
  tag_element: tool({
    description:
      "Aggiunge un elemento al breakdown della scena indicata (cast, prop, location, etc.). " +
      "Crea l'elemento se non esiste già e collega l'occurrence alla scena. " +
      "Usa questo tool quando l'utente chiede di 'spogliare X' o 'aggiungere X come oggetto'.",
    inputSchema: z.object({
      scene_number: z
        .number()
        .describe("Numero ordinale della scena (1-based)."),
      category: z
        .string()
        .describe(
          "Categoria del breakdown: cast, extras, stunts, props, vehicles, wardrobe, makeup, sfx, vfx, sound, animals, atmosphere, set_dress, equipment, locations.",
        ),
      name: z
        .string()
        .describe("Nome dell'elemento (es. 'pistola', 'tavolo cucina')."),
      quantity: z.number().optional().describe("Quantità (default 1)."),
    }),
    execute: async (input, _opts) => {
      const result = await executeTagElement(
        input as TagElementInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  accept_ghost: tool({
    description:
      "Accetta un suggerimento ghost (verde tratteggiato) e lo trasforma in elemento confermato del breakdown.",
    inputSchema: z.object({
      occurrence_id: z.string().describe("UUID dell'occurrence da accettare."),
    }),
    execute: async (input, _opts) => {
      const result = await executeSetGhostStatus(
        input as GhostInput,
        db,
        projectId,
        "accepted",
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  reject_ghost: tool({
    description:
      "Rifiuta un suggerimento ghost rimuovendolo dalla lista delle proposte attive.",
    inputSchema: z.object({
      occurrence_id: z.string().describe("UUID dell'occurrence da rifiutare."),
    }),
    execute: async (input, _opts) => {
      const result = await executeSetGhostStatus(
        input as GhostInput,
        db,
        projectId,
        "ignored",
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  estimate_scene_cost: tool({
    description:
      "Calcola il costo stimato e la difficoltà di una scena usando i dati del breakdown e le rate di produzione del progetto. " +
      "Restituisce totale, righe per categoria, difficoltà 1-5 e note.",
    inputSchema: z.object({
      scene_number: z
        .number()
        .describe("Numero ordinale della scena (1-based)."),
    }),
    execute: async (input, _opts) => {
      const result = await executeEstimateSceneCost(
        input as SceneNumberInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  add_to_budget: tool({
    description:
      "Converte la stima di costo di una scena in righe budget reali. " +
      "Crea una riga per ciascuna voce della stima nel budget corrente del progetto.",
    inputSchema: z.object({
      scene_number: z
        .number()
        .describe(
          "Numero ordinale della scena di cui aggiungere i costi al budget.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeAddSceneToBudget(
        input as SceneNumberInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
});

export type BreakdownTools = ReturnType<typeof createBreakdownTools>;

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

// ─── list_location_requirements ───────────────────────────────────────────────

interface ListLocationRequirementsInput {
  scene_number?: number;
}

interface RequirementSummary {
  id: string;
  name: string;
  int_ext: string | null;
  time_of_day: string[];
  status: string;
  scene_numbers: number[];
  candidate_count: number;
}

const executeListLocationRequirements = (
  input: ListLocationRequirementsInput,
  db: Db,
  projectId: string,
): ResultAsync<{ requirements: RequirementSummary[] }, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const reqs = await db
        .select({
          id: locationRequirements.id,
          name: locationRequirements.name,
          intExt: locationRequirements.intExt,
          timeOfDay: locationRequirements.timeOfDay,
          status: locationRequirements.status,
        })
        .from(locationRequirements)
        .where(eq(locationRequirements.projectId, projectId));

      if (reqs.length === 0) return { requirements: [] };

      const ids = reqs.map((r) => r.id);

      const links = await db
        .select({
          requirementId: locationRequirementScenes.requirementId,
          sceneNumber: scenes.number,
        })
        .from(locationRequirementScenes)
        .innerJoin(scenes, eq(locationRequirementScenes.sceneId, scenes.id))
        .where(inArray(locationRequirementScenes.requirementId, ids));

      const counts = await db
        .select({
          requirementId: locationCandidates.requirementId,
          count: sql<number>`count(*)`.as("count"),
        })
        .from(locationCandidates)
        .where(inArray(locationCandidates.requirementId, ids))
        .groupBy(locationCandidates.requirementId);

      const scenesByReq = new Map<string, number[]>();
      for (const link of links) {
        const arr = scenesByReq.get(link.requirementId) ?? [];
        arr.push(link.sceneNumber);
        scenesByReq.set(link.requirementId, arr);
      }

      const countsByReq = new Map<string, number>();
      for (const c of counts) {
        countsByReq.set(c.requirementId, Number(c.count));
      }

      const summaries: RequirementSummary[] = reqs.map((r) => ({
        id: r.id,
        name: r.name,
        int_ext: r.intExt ?? null,
        time_of_day: r.timeOfDay ?? [],
        status: r.status,
        scene_numbers: (scenesByReq.get(r.id) ?? []).sort((a, b) => a - b),
        candidate_count: countsByReq.get(r.id) ?? 0,
      }));

      if (typeof input.scene_number === "number") {
        const filtered = summaries.filter((s) =>
          s.scene_numbers.includes(input.scene_number!),
        );
        return { requirements: filtered };
      }

      return { requirements: summaries };
    })(),
    (e) =>
      new CesareError(
        `executeListLocationRequirements failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

// ─── create_location_requirement + find_or_create ───────────────────────────

interface CreateLocationRequirementInput {
  scene_number: number;
  brief?: string;
}

interface RequirementCreated {
  requirement_id: string;
  name: string;
  int_ext: string | null;
  time_of_day: string[];
  created: boolean;
}

// Derive sensible defaults from a scene heading. Slugline shape:
//   "INT./EXT. LOCATION NAME - TIME OF DAY"
// We split on " - " to peel off the time-of-day suffix, then split the prefix
// to peel off INT./EXT. Whatever remains is the location label.
export type RequirementIntExt = "INT" | "EXT" | "INT/EXT";

export const parseHeading = (
  heading: string,
): { name: string; intExt: RequirementIntExt | null; timeOfDay: string[] } => {
  const trimmed = heading.trim();
  const intExtMatch =
    /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\.|EXT\.|EST\.|I\/E)\s+/i.exec(trimmed);
  const intExtRaw = intExtMatch ? intExtMatch[1]!.toUpperCase() : null;
  const rest = intExtMatch ? trimmed.slice(intExtMatch[0].length) : trimmed;
  const parts = rest
    .split(" - ")
    .map((p) => p.trim())
    .filter(Boolean);
  const name = parts.length > 0 ? parts[0]! : rest;
  const timeOfDay = parts.length > 1 ? parts.slice(1) : [];

  // Schema accepts only INT / EXT / INT/EXT. EST. is rare and not yet
  // modelled — fold it into EXT (closest semantic).
  const normalisedIntExt: RequirementIntExt | null = intExtRaw
    ? intExtRaw.includes("INT") && intExtRaw.includes("EXT")
      ? "INT/EXT"
      : intExtRaw.startsWith("INT") || intExtRaw === "I/E"
        ? "INT"
        : intExtRaw.startsWith("EXT") || intExtRaw.startsWith("EST")
          ? "EXT"
          : null
    : null;

  return { name, intExt: normalisedIntExt, timeOfDay };
};

const findSceneByNumber = async (
  db: Db,
  projectId: string,
  sceneNumber: number,
): Promise<{ id: string; heading: string } | null> => {
  const [scene] = await db
    .select({
      id: scenes.id,
      heading: scenes.heading,
    })
    .from(scenes)
    .innerJoin(screenplays, eq(scenes.screenplayId, screenplays.id))
    .where(
      and(eq(screenplays.projectId, projectId), eq(scenes.number, sceneNumber)),
    )
    .limit(1);
  return scene ?? null;
};

const executeCreateLocationRequirement = (
  input: CreateLocationRequirementInput,
  db: Db,
  projectId: string,
): ResultAsync<RequirementCreated, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const scene = await findSceneByNumber(db, projectId, input.scene_number);
      if (!scene) {
        throw new Error(
          `Scena ${input.scene_number} non trovata nel progetto.`,
        );
      }

      const { name, intExt, timeOfDay } = parseHeading(scene.heading);

      const [inserted] = await db
        .insert(locationRequirements)
        .values({
          projectId,
          name,
          description: input.brief ?? null,
          intExt,
          timeOfDay,
        })
        .returning({
          id: locationRequirements.id,
          name: locationRequirements.name,
          intExt: locationRequirements.intExt,
          timeOfDay: locationRequirements.timeOfDay,
        });
      if (!inserted) throw new Error("Insert returned no rows");

      await db.insert(locationRequirementScenes).values({
        requirementId: inserted.id,
        sceneId: scene.id,
      });

      return {
        requirement_id: inserted.id,
        name: inserted.name,
        int_ext: inserted.intExt ?? null,
        time_of_day: inserted.timeOfDay ?? [],
        created: true,
      };
    })(),
    (e) =>
      new CesareError(
        `executeCreateLocationRequirement failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

const executeFindOrCreateRequirementForScene = (
  input: { scene_number: number },
  db: Db,
  projectId: string,
): ResultAsync<RequirementCreated, CesareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const scene = await findSceneByNumber(db, projectId, input.scene_number);
      if (!scene) {
        throw new Error(
          `Scena ${input.scene_number} non trovata nel progetto.`,
        );
      }

      const [existing] = await db
        .select({
          id: locationRequirements.id,
          name: locationRequirements.name,
          intExt: locationRequirements.intExt,
          timeOfDay: locationRequirements.timeOfDay,
        })
        .from(locationRequirementScenes)
        .innerJoin(
          locationRequirements,
          eq(locationRequirementScenes.requirementId, locationRequirements.id),
        )
        .where(
          and(
            eq(locationRequirementScenes.sceneId, scene.id),
            eq(locationRequirements.projectId, projectId),
          ),
        )
        .limit(1);

      if (existing) {
        return {
          requirement_id: existing.id,
          name: existing.name,
          int_ext: existing.intExt ?? null,
          time_of_day: existing.timeOfDay ?? [],
          created: false,
        };
      }

      // Same body as executeCreateLocationRequirement without the scene lookup.
      const { name, intExt, timeOfDay } = parseHeading(scene.heading);
      const [inserted] = await db
        .insert(locationRequirements)
        .values({
          projectId,
          name,
          intExt,
          timeOfDay,
        })
        .returning({
          id: locationRequirements.id,
          name: locationRequirements.name,
          intExt: locationRequirements.intExt,
          timeOfDay: locationRequirements.timeOfDay,
        });
      if (!inserted) throw new Error("Insert returned no rows");

      await db.insert(locationRequirementScenes).values({
        requirementId: inserted.id,
        sceneId: scene.id,
      });

      return {
        requirement_id: inserted.id,
        name: inserted.name,
        int_ext: inserted.intExt ?? null,
        time_of_day: inserted.timeOfDay ?? [],
        created: true,
      };
    })(),
    (e) =>
      new CesareError(
        `executeFindOrCreateRequirementForScene failed: ${e instanceof Error ? e.message : String(e)}`,
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

/**
 * Result of a live document apply: the freshly created version plus the one
 * that was active before it. The client wires `previousVersionId` into the
 * inline trace's "↩ Annulla" so the user can revert the live document. Null
 * when the document had no active version yet (first content ever written).
 */
export interface AppliedDocumentEdit {
  versionId: string;
  previousVersionId: string | null;
}

// Applies new content LIVE to the open document following the canonical Spec 44
// Agentic Edit Pattern: every Cesare edit auto-creates a NEW non-draft version,
// repoints documents.current_version_id at it, and mirrors the content onto the
// document row so the open editor reflects it. The previous active version stays
// in history so the inline trace can offer "↩ Annulla". We must NOT update the
// active version row in place — that would erase history and leave nothing to
// revert to (the iter-1 regression). `createdBy` falls back to the supplied
// `userIdFallback` when the document row carries no creator.
export const persistDocumentContent = (
  db: Db,
  documentId: string,
  nextContent: string,
  userIdFallback: string | null,
): ResultAsync<AppliedDocumentEdit, CesareError> =>
  ResultAsync.fromPromise(
    db.transaction(async (tx): Promise<AppliedDocumentEdit> => {
      const [doc] = await tx
        .select({
          id: documents.id,
          currentVersionId: documents.currentVersionId,
          createdBy: documents.createdBy,
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
      if (!doc) throw new Error(`Document ${documentId} not found`);

      const previousVersionId = doc.currentVersionId ?? null;
      const creator = doc.createdBy ?? userIdFallback;
      if (!creator) {
        throw new Error(
          "Cannot determine the version author: document has no createdBy and no fallback user.",
        );
      }

      const [maxRow] = await tx
        .select({
          max: sql<number>`coalesce(max(${documentVersions.number}), 0)`,
        })
        .from(documentVersions)
        .where(eq(documentVersions.documentId, documentId));
      const nextNum = (maxRow?.max ?? 0) + 1;

      const [inserted] = await tx
        .insert(documentVersions)
        .values({
          documentId,
          number: nextNum,
          label: `Cesare · modifica ${nextNum}`,
          content: nextContent,
          isDraft: false,
          createdBy: creator,
        })
        .returning({ id: documentVersions.id });
      if (!inserted) throw new Error("persistDocumentContent returned no rows");

      await tx
        .update(documents)
        .set({
          currentVersionId: inserted.id,
          content: nextContent,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, doc.id));

      return { versionId: inserted.id, previousVersionId };
    }),
    (e) =>
      new CesareError(
        `persistDocumentContent failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

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

interface DocumentEditResult {
  ok: boolean;
  reason?: string;
  toast?: string;
  applied_live?: boolean;
  document_type?: DocumentType;
  version_id?: string;
  previous_version_id?: string | null;
  /** Spec 76 — set when a large edit asked instead of applying (no version
   *  written). The client renders the [Sovrascrivi] [Nuova versione] card. */
  asked_new_version?: true;
  changed_word_ratio?: number;
  ask?: string;
  /** Spec 47b FIX 4 — precomputed word-level diff segments (before → after) so
   *  the client can render the inline coloured live diff without a round-trip. */
  diff_label?: string;
  diff_segments?: ReadonlyArray<{ op: "eq" | "add" | "del"; text: string }>;
}

const executeApplyTextEdit = (
  input: ApplyTextEditInput,
  db: Db,
  doc: DocumentContext,
  userIdFallback: string | null,
  sessionId: string | null,
  userInstruction: string | null,
): ResultAsync<DocumentEditResult, CesareError> => {
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
  const previousContent = doc.content;
  const next = previousContent.replace(input.find, input.replace);
  // Spec 76 — route the surgical edit through the SAME commit policy as the
  // generation tools (kills the second seam): a small find/replace overwrites
  // the working version in place; a large one asks before minting.
  return commitDocumentEdit(
    db,
    doc,
    previousContent,
    next,
    userIdFallback,
    sessionId,
    userInstruction,
  );
};

// Shared commit for the surgical doc-edit tools (apply_text_edit / expand /
// compress). Runs commitOrAsk and maps the outcome to a DocumentEditResult —
// either the applied draft (with diff segments) or the large-edit ask payload.
// `userInstruction` is the user's words this turn (the tool input is a scripted
// find/replace), so an explicit "nuova versione" / "sovrascrivi" is honoured.
const commitDocumentEdit = (
  db: Db,
  doc: DocumentContext,
  previousContent: string,
  next: string,
  userIdFallback: string | null,
  sessionId: string | null,
  userInstruction: string | null,
): ResultAsync<DocumentEditResult, CesareError> =>
  commitOrAsk(
    db,
    doc.documentId,
    doc.documentType,
    userIdFallback ?? "",
    previousContent,
    next,
    `Cesare · ${docTypeLabel(doc.documentType)}`,
    {
      sessionId,
      userRequestedNewVersion: userRequestedNewVersion(userInstruction),
      largeEditConfirmed: false,
      largeEditOverwriteConfirmed: userConfirmedOverwrite(userInstruction),
    },
  ).map((outcome) => {
    if (isAsked(outcome)) {
      return {
        ok: true,
        applied_live: false as const,
        asked_new_version: true as const,
        document_type: doc.documentType,
        changed_word_ratio: outcome.changedWordRatio,
        ask: `Questa è una modifica importante a ${docTypeLabel(
          doc.documentType,
        )} (${Math.round(
          outcome.changedWordRatio * 100,
        )}% del testo cambia). La applico sulla versione corrente o ne creo una nuova?`,
      };
    }
    // Applied — mutate the in-memory copy so later tool calls in the same turn
    // see the updated content.
    doc.content = next;
    return {
      ok: true,
      applied_live: true as const,
      document_type: doc.documentType,
      version_id: outcome.versionId,
      previous_version_id: outcome.previousVersionId,
      diff_label: docTypeLabel(doc.documentType),
      diff_segments: buildWordDiffSegments(previousContent, next),
      toast: `✦ Cesare ha aggiornato il ${docTypeLabel(doc.documentType)}`,
    };
  });

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
  userIdFallback: string | null,
  sessionId: string | null,
  userInstruction: string | null,
): ResultAsync<DocumentEditResult, CesareError> => {
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
      const previousContent = doc.content;
      const nextContent = replaceSection(previousContent, range, newText);
      // Spec 76 — same commit policy as every other edit (small overwrites, large
      // asks). A section expand/compress is an iterative edit, not a regeneration.
      return commitDocumentEdit(
        db,
        doc,
        previousContent,
        nextContent,
        userIdFallback,
        sessionId,
        userInstruction,
      ).map((res) =>
        // Keep the section-specific diff label + toast verb on an applied edit.
        res.applied_live
          ? {
              ...res,
              diff_label: range.headingText.replace(/^#+\s*/, "").trim(),
              toast: `✦ Cesare ha ${toastVerb} "${range.headingText.replace(/^#+\s*/, "").trim()}"`,
            }
          : res,
      );
    });
};

export const executeDocumentTool = (
  block: ToolUseBlock,
  db: Db,
  docContext: DocumentContext,
  userIdFallback: string | null = null,
  sessionId: string | null = null,
  userInstruction: string | null = null,
): ResultAsync<ToolResult, CesareError> => {
  const successResult = (id: string, payload: unknown): ToolResult => ({
    type: "tool_result",
    tool_use_id: id,
    content: JSON.stringify(payload),
  });

  if (block.name === "apply_text_edit") {
    const input = block.input as ApplyTextEditInput;
    return executeApplyTextEdit(
      input,
      db,
      docContext,
      userIdFallback,
      sessionId,
      userInstruction,
    ).map((res) => successResult(block.id, res));
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
      userIdFallback,
      sessionId,
      userInstruction,
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
      userIdFallback,
      sessionId,
      userInstruction,
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

  if (block.name === "list_location_requirements") {
    const input = block.input as ListLocationRequirementsInput;
    return executeListLocationRequirements(input, db, projectId).map((result) =>
      successResult(block.id, JSON.stringify(result)),
    );
  }

  if (block.name === "create_location_requirement") {
    const input = block.input as CreateLocationRequirementInput;
    return executeCreateLocationRequirement(input, db, projectId).map(
      (result) => successResult(block.id, JSON.stringify(result)),
    );
  }

  if (block.name === "find_or_create_requirement_for_scene") {
    const input = block.input as { scene_number: number };
    return executeFindOrCreateRequirementForScene(input, db, projectId).map(
      (result) => successResult(block.id, JSON.stringify(result)),
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

// ─── Specific tool loop entry points ─────────────────────────────────────────
// Each function selects the right set of AI SDK tools (for the production path)
// and the matching legacy executor (for the MOCK_AI path). The `client`
// parameter has been removed — `generateText` resolves the connection via the
// `@ai-sdk/anthropic` provider. For MOCK_AI, a `legacyMockClient` is injected
// automatically by each function below.

const resolveMockClient = (): LegacyAnthropicClient | undefined => {
  if (process.env["MOCK_AI"] !== "true") return undefined;
  return createMockAnthropicClient() as unknown as LegacyAnthropicClient;
};

// Returns a MockLanguageModelV3 when MOCK_AI=true, undefined otherwise.
// The mock model intercepts generateText calls and emits scripted scenario
// turns without hitting the Anthropic API — same code path as production.
const resolveMockModel = () => {
  if (process.env["MOCK_AI"] !== "true") return undefined;
  return createMockCesareModel();
};

export const runToolLoop = (
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  fallbackRequirementId: string | null = null,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    sdkTools: {
      ...createLocationTools(db, projectId),
      ...createReadTools(db, projectId),
    },
    legacyTools: [
      ...CESARE_LOCATION_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    mockModel: resolveMockModel(),
    legacyMockClient: resolveMockClient(),
    executor: (block, dbArg, projectIdArg) =>
      executeTool(block, dbArg, projectIdArg, fallbackRequirementId),
  });

export const runScreenplayToolLoop = (
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  forcedFirstTool?: string,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    forcedFirstTool,
    sdkTools: {
      ...createScreenplayTools(db, projectId),
      ...createReadTools(db, projectId),
    },
    legacyTools: [
      ...CESARE_SCREENPLAY_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    mockModel: resolveMockModel(),
    legacyMockClient: resolveMockClient(),
    executor: (block, dbArg, projectIdArg) => {
      const readFallthrough = tryExecuteReadTool(block, dbArg, projectIdArg);
      if (readFallthrough) return readFallthrough;
      return executeScreenplayTool(block, dbArg, projectIdArg);
    },
  });

export const runDocumentToolLoop = (
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  docContext: DocumentContext,
  userIdFallback: string | null = null,
  sessionId: string | null = null,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    sdkTools: {
      ...createDocumentTools(db, docContext, userIdFallback, sessionId),
      ...createDocumentGenTools(db, projectId, userIdFallback, sessionId),
      ...createReadTools(db, projectId),
    },
    legacyTools: [
      ...CESARE_DOCUMENT_TOOLS,
      ...CESARE_DOCUMENT_GEN_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    mockModel: resolveMockModel(),
    legacyMockClient: resolveMockClient(),
    executor: (block, dbArg, projectIdArg) => {
      const readFallthrough = tryExecuteReadTool(block, dbArg, projectIdArg);
      if (readFallthrough) return readFallthrough;
      if (isDocumentGenToolName(block.name)) {
        return executeDocumentGenTool(
          block,
          dbArg,
          projectIdArg,
          userIdFallback,
          sessionId,
        );
      }
      return executeDocumentTool(
        block,
        dbArg,
        docContext,
        userIdFallback,
        sessionId,
      );
    },
  });

export const runBreakdownToolLoop = (
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    sdkTools: {
      ...createBreakdownTools(db, projectId),
      ...createReadTools(db, projectId),
    },
    legacyTools: [
      ...CESARE_BREAKDOWN_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    mockModel: resolveMockModel(),
    legacyMockClient: resolveMockClient(),
    executor: (block, dbArg, projectIdArg) =>
      executeBreakdownTool(block, dbArg, projectIdArg),
  });

export const runScheduleToolLoop = (
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  scheduleContext: ScheduleToolContext,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    sdkTools: {
      ...createScheduleTools(db, scheduleContext),
      ...createReadTools(db, projectId),
    },
    legacyTools: [
      ...CESARE_SCHEDULE_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    mockModel: resolveMockModel(),
    legacyMockClient: resolveMockClient(),
    executor: (block, dbArg, projectIdArg) => {
      const readFallthrough = tryExecuteReadTool(block, dbArg, projectIdArg);
      if (readFallthrough) return readFallthrough;
      return executeScheduleTool(block, dbArg, scheduleContext);
    },
  });

export const runShootingPlanToolLoop = (
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  shootingPlanContext: ShootingPlanToolContext,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    sdkTools: {
      ...createShootingPlanTools(db, shootingPlanContext),
      ...createReadTools(db, projectId),
    },
    legacyTools: [
      ...CESARE_SHOOTING_PLAN_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    mockModel: resolveMockModel(),
    legacyMockClient: resolveMockClient(),
    executor: (block, dbArg, projectIdArg) => {
      const readFallthrough = tryExecuteReadTool(block, dbArg, projectIdArg);
      if (readFallthrough) return readFallthrough;
      return executeShootingPlanTool(block, dbArg, shootingPlanContext);
    },
  });

// ─── Universal dispatch ─────────────────────────────────────────────────────
// Spec 43: one tool loop, every tool always available, page is just context.

import { createUniversalCesareTools } from "./cesare-universal-tools";
import type { UniversalToolContext } from "./cesare-universal-tools";

export const runUniversalToolLoop = (
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  ctx: UniversalToolContext,
  model: string,
  forcedFirstTool?: string,
): ResultAsync<string, CesareError> => {
  const docContext = ctx.documentContext;
  return runGenericToolLoop({
    systemPrompt,
    messages,
    db,
    projectId: ctx.projectId,
    model,
    forcedFirstTool,
    sdkTools: createUniversalCesareTools(db, ctx),
    legacyTools: [
      ...CESARE_LOCATION_TOOLS,
      ...CESARE_SCREENPLAY_TOOLS,
      ...CESARE_DOCUMENT_TOOLS,
      ...CESARE_DOCUMENT_GEN_TOOLS,
      ...CESARE_BREAKDOWN_TOOLS,
      ...CESARE_BUDGET_TOOLS,
      ...CESARE_SCHEDULE_TOOLS,
      ...CESARE_SHOOTING_PLAN_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    mockModel: resolveMockModel(),
    legacyMockClient: resolveMockClient(),
    // Universal executor: try each domain executor in cascade. Read tools
    // first (zero-cost lookup), then per-domain. The fallthrough at the end
    // covers tools whose executor is the cross-domain `executeTool`
    // (location + a few utility tools) by delegating to it. Unknown tools
    // surface a friendly error from `executeTool` itself.
    executor: (block, dbArg, projectIdArg) => {
      const readFallthrough = tryExecuteReadTool(block, dbArg, projectIdArg);
      if (readFallthrough) return readFallthrough;

      // Screenplay tools (propose_*, rewrite_scene, merge_scenes, …)
      const screenplayNames = new Set(
        CESARE_SCREENPLAY_TOOLS.map((t) => t.name),
      );
      if (screenplayNames.has(block.name as never)) {
        return executeScreenplayTool(block, dbArg, projectIdArg);
      }

      // Document edit tools (apply_text_edit, …)
      const docNames = new Set(CESARE_DOCUMENT_TOOLS.map((t) => t.name));
      if (docNames.has(block.name as never)) {
        return executeDocumentTool(
          block,
          dbArg,
          docContext ?? {
            documentId: "",
            documentType: "logline",
            content: "",
          },
          ctx.userIdFallback,
          ctx.sessionId,
        );
      }

      // Document generation tools (propose_logline, …)
      if (isDocumentGenToolName(block.name)) {
        return executeDocumentGenTool(
          block,
          dbArg,
          projectIdArg,
          ctx.userIdFallback,
          ctx.sessionId,
        );
      }

      // Breakdown tools
      const breakdownNames = new Set(CESARE_BREAKDOWN_TOOLS.map((t) => t.name));
      if (breakdownNames.has(block.name as never)) {
        return executeBreakdownTool(block, dbArg, projectIdArg);
      }

      // Budget tools
      const budgetNames = new Set(CESARE_BUDGET_TOOLS.map((t) => t.name));
      if (budgetNames.has(block.name as never)) {
        return executeBudgetTool(block, dbArg, projectIdArg);
      }

      // Schedule tools
      const scheduleNames = new Set(CESARE_SCHEDULE_TOOLS.map((t) => t.name));
      if (scheduleNames.has(block.name as never)) {
        return executeScheduleTool(block, dbArg, {
          projectId: projectIdArg,
          activeDayNumber: ctx.activeDayNumber,
        });
      }

      // Shooting-plan tools
      const shootingPlanNames = new Set(
        CESARE_SHOOTING_PLAN_TOOLS.map((t) => t.name),
      );
      if (shootingPlanNames.has(block.name as never)) {
        return executeShootingPlanTool(block, dbArg, {
          projectId: projectIdArg,
          activeSceneId: ctx.activeSceneId,
        });
      }

      // Default: location + utility tools (search_places, add_candidate,
      // list_location_requirements, create_location_requirement,
      // find_or_create_requirement_for_scene). Also surfaces "Unknown tool"
      // for anything that didn't match above.
      return executeTool(block, dbArg, projectIdArg, null);
    },
  });
};

interface RunToolLoopArgs {
  systemPrompt: string | readonly unknown[];
  messages: Message[];
  db: Db;
  projectId: string;
  model: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdkTools: Record<string, Tool<any, any>>;
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
  /**
   * Mock AI SDK language model — used only when MOCK_AI=true. When present,
   * generateText uses this model instead of anthropic(args.model), so the
   * entire production code path runs against the scripted mock.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockModel?: any;
  /**
   * Legacy Anthropic SDK client — kept for compatibility but superseded by
   * mockModel. Only used as a fallback if mockModel is not provided.
   */
  legacyMockClient?: LegacyAnthropicClient;
  /** Legacy tool definitions array — required only alongside legacyMockClient. */
  legacyTools?: readonly unknown[];
  /**
   * Spec 47a (A2) — optional sink for live step events. When provided, the loop
   * emits `reasoning | reading | writing | tool` events as steps finish, then a
   * terminal `done`. The streaming route (`/api/cesare/stream`) supplies this;
   * the non-streaming `askCesare` path leaves it undefined so behaviour is
   * identical to before.
   */
  onStreamEvent?: (event: CesareStreamEvent) => void;
  /**
   * Spec 48 (W-E2) — optional abort signal bridged from the Effect fiber that
   * orchestrates the streamed run. When the client aborts the fetch (drawer
   * closed / navigation / connection drop), the stream's `cancel` interrupts the
   * fiber, which aborts this signal; the AI SDK `generateText` call honours it
   * and tears the model request down, so no server-side work leaks. Undefined on
   * the non-streaming path, where behaviour is identical to before.
   */
  abortSignal?: AbortSignal;
}

/**
 * Spec 47a (A2) — translate one completed tool call into a step event and push
 * it to the sink. A `read_*` tool emits `reading{entity}`, a mutating tool emits
 * `writing{entity}`, and an unmapped tool falls back to a raw `tool` event. The
 * entity is the tool's TARGET domain (cross-domain aware), not the page.
 */
const emitToolStep = (
  toolName: string,
  onStreamEvent: ((event: CesareStreamEvent) => void) | undefined,
): void => {
  if (!onStreamEvent) return;
  const mapping = mappingForTool(toolName);
  if (!mapping) {
    onStreamEvent({ _tag: "tool", name: toolName });
    return;
  }
  const entity = entityRefForDomain(mapping.domain);
  onStreamEvent(
    mapping.access === "read"
      ? { _tag: "reading", entity }
      : { _tag: "writing", entity },
  );
};

// ─── Legacy client interface (MOCK_AI=true only) ──────────────────────────────

interface LegacyAnthropicClient {
  messages: {
    create(args: Record<string, unknown>): Promise<{
      content: unknown[];
      stop_reason?: string | null;
    }>;
  };
}

// ─── Side-channel marker extraction ──────────────────────────────────────────
// Both the legacy and AI-SDK paths need to inspect certain tool results for
// embedded HTML markers that the CesareSheet parses on the client.

export const extractSideChannelMarkers = (
  toolName: string,
  toolResultContent: string,
  accumulator: string[],
): void => {
  if (toolName === "propose_blocking_for_scene") {
    try {
      const payload = JSON.parse(toolResultContent);
      if (payload && typeof payload === "object" && !("error" in payload)) {
        accumulator.push(
          `<!--ohw:blocking-proposal:${JSON.stringify(payload)}-->`,
        );
      }
    } catch {
      // ignore malformed payloads — the marker is best-effort
    }
  }
  if (toolName === "rewrite_scene") {
    try {
      const payload = JSON.parse(toolResultContent) as unknown;
      if (
        payload &&
        typeof payload === "object" &&
        "marker" in (payload as Record<string, unknown>) &&
        typeof (payload as Record<string, unknown>)["marker"] === "string"
      ) {
        accumulator.push(
          (payload as Record<string, unknown>)["marker"] as string,
        );
      }
    } catch {
      // ignore malformed payloads — the marker is best-effort
    }
  }
  // Screenplay PROPOSAL tools push into the server-side in-memory proposal
  // bucket; the client renders the ✓/✗ decorations (edits/renames) or the draft
  // banner (revision) from the `screenplay-proposals` query. That query is NOT
  // refetched on its own — without a signal the proposal stays invisible while
  // the turn still claims "Fatto" (bug N3). Emit a proposal marker on a
  // successful call so the client invalidates the query and the proposal
  // surfaces. This is a PROPOSAL signal, not an applied-edit signal: it tells
  // the client to refetch, not that the doc changed.
  if (SCREENPLAY_PROPOSAL_TOOLS.has(toolName)) {
    if (isSuccessfulToolResult(toolResultContent)) {
      accumulator.push("<!--ohw:screenplay-proposal-->");
    }
  }
  // Document tools apply the new content LIVE to the open document (Spec 44
  // canonical pattern) — both the whole-document generators (propose_*) and the
  // in-place edits (apply_text_edit / expand_section / compress_section). We
  // surface a marker carrying the version that was active before the apply so
  // the client can render an "↩ Annulla" that reverts the live document to its
  // previous state.
  if (
    toolName === "propose_logline_from_screenplay" ||
    toolName === "write_logline" ||
    toolName === "propose_synopsis_from_screenplay" ||
    toolName === "propose_soggetto_v2" ||
    toolName === "propose_scaletta_from_soggetto" ||
    toolName === "propose_treatment_from_narrative" ||
    toolName === "generate_screenplay_from_narrative" ||
    toolName === "apply_text_edit" ||
    toolName === "expand_section" ||
    toolName === "compress_section"
  ) {
    try {
      const payload = JSON.parse(toolResultContent) as Record<string, unknown>;
      if (payload && payload["applied_live"] === true) {
        accumulator.push(
          `<!--ohw:doc-applied:${JSON.stringify({
            document_type: payload["document_type"],
            version_id: payload["version_id"],
            previous_version_id: payload["previous_version_id"],
          })}-->`,
        );
        // Spec 47d — when the edit carries precomputed word-diff segments, emit
        // them base64-encoded so the client renders the inline coloured live
        // diff INSIDE the document (no overlay) for "Mostra modifiche" without
        // an extra round-trip. One marker per touched document; the payload
        // carries the `document_type` so the shell keys the highlight per doc
        // (a cross-entity edit emits several markers, one per touched entity).
        const segments = payload["diff_segments"];
        if (Array.isArray(segments) && segments.length > 0) {
          const diffJson = JSON.stringify({
            documentType: payload["document_type"] ?? "",
            label: payload["diff_label"] ?? "",
            segments,
          });
          const b64 = Buffer.from(diffJson, "utf-8").toString("base64");
          accumulator.push(`<!--ohw:live-diff-b64:${b64}-->`);
        }
      }
      // Spec 76 Slice 2 — a large unconfirmed edit asked instead of applying.
      // No version was written; emit the ask marker so the client renders the
      // [Sovrascrivi] [Nuova versione] card (keyed on document_type so the
      // re-send targets the same entity).
      if (payload && payload["asked_new_version"] === true) {
        accumulator.push(
          `<!--ohw:ask-new-version:${JSON.stringify({
            document_type: payload["document_type"],
            changed_word_ratio: payload["changed_word_ratio"],
            ask: payload["ask"],
          })}-->`,
        );
      }
    } catch {
      // ignore malformed payloads — the marker is best-effort
    }
    return;
  }

  // Honest success signal for the NON-document write tools — budget, location,
  // schedule, breakdown and shooting-plan (F-A3). These don't carry a versioned
  // document so they have no `doc-applied` marker; without a signal the client
  // would have to guess "did anything change?" from the chat text, which is
  // exactly the bug. We emit the marker ONLY when (a) the tool genuinely COMMITS
  // a DB mutation — proposal tools (`propose_*`, which surface a suggestion for
  // the user to accept) are deliberately excluded so the card never claims an
  // edit that hasn't happened — AND (b) the result parses to a non-error object
  // (a failed/no-op tool returns `{ error: … }`; the loop wraps thrown
  // CesareErrors that way). The marker carries the entity the TOOL touched (not
  // the page), so the card labels the real edited entity (F-M1).
  if (APPLYING_NON_DOCUMENT_TOOLS.has(toolName)) {
    const mapping = mappingForTool(toolName);
    if (mapping && isSuccessfulToolResult(toolResultContent)) {
      accumulator.push(
        `<!--ohw:entity-applied:${JSON.stringify({
          domain: mapping.domain,
          label: labelForDomain(mapping.domain),
        })}-->`,
      );
    }
  }
};

// Screenplay tools that emit a PROPOSAL into the server-side bucket (not an
// applied edit). A successful call must nudge the client to refetch the
// `screenplay-proposals` query so the ✓/✗ decorations / draft banner appear.
// merge_scenes and propose_screenplay_revision both create draft banners;
// propose_rename_entity pushes an inline rename proposal.
const SCREENPLAY_PROPOSAL_TOOLS: ReadonlySet<string> = new Set([
  "propose_rename_entity",
  "propose_screenplay_revision",
  "merge_scenes",
]);

// The non-document write tools that COMMIT a DB mutation directly (no proposal,
// no document version). Kept explicit — not derived from the entity-map's
// `access: "write"` — because several `propose_*` tools are classified write
// but only SURFACE a suggestion; emitting an applied marker for them would
// re-introduce the fabricated-success bug (F-A3). Document tools are handled by
// the `doc-applied` branch above and are intentionally absent here.
const APPLYING_NON_DOCUMENT_TOOLS: ReadonlySet<string> = new Set([
  // budget
  "set_budget_cap",
  "update_budget_line",
  "add_budget_line",
  "add_to_budget",
  "mark_line_actual",
  "redistribute_topsheet",
  "accept_ghost",
  "reject_ghost",
  // breakdown
  "tag_element",
  // schedule
  "move_scene_to_day",
  "swap_scenes",
  "merge_days",
  "lock_day",
  "unlock_day",
  // locations
  "add_candidate",
  "create_location_requirement",
  "find_or_create_requirement_for_scene",
  // shooting-plan
  "add_shot_to_plan",
  "update_shot",
  "remove_shot",
  "add_parallel_plan",
  "set_active_plan",
  "generate_plan_from_description",
]);

// A tool result is a genuine success when it parses to an object that does NOT
// carry an `error` key. Failures (and the loop's error-recovery wrapper) always
// produce `{ error: … }`; a no-op that throws becomes the same. Non-object or
// unparseable content is treated as not-applied — we never claim success we
// can't see.
const isSuccessfulToolResult = (toolResultContent: string): boolean => {
  try {
    const parsed = JSON.parse(toolResultContent) as unknown;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !("error" in (parsed as Record<string, unknown>))
    );
  } catch {
    return false;
  }
};

// ─── Effect ⇄ neverthrow seam for the tool loop (Spec 48 W-E3) ────────────────
//
// The tool loop is modelled as an `Effect` internally (typed errors, structured
// concurrency, interruption inherited from the W-E2 stream fiber via the bridged
// AbortSignal). The PUBLIC functions still return `ResultAsync<string,
// CesareError>` so the frozen W-E2 seam (`CesareStreamRun.handle`) and the
// non-streaming `askCesare` path are byte-identical. This local bridge is the
// single translation point Effect → neverthrow for this module — the mirror of
// the global ACL (`runAiEffect`), kept local because the loop runs as a fiber
// the stream already provided, not under the foundation Layers here.
//
// Faithful equivalent of the previous `ResultAsync.fromPromise(asyncIIFE, …)`:
// that bridge funnelled EVERY thrown error (typed or not) into a `CesareError`.
// Here a defect (an unexpected synchronous throw — e.g. inside a marker
// extraction) is first folded into the typed channel via `catchAllDefect`, so
// the whole turn always settles as a `CesareError` rather than rejecting the
// promise. `Effect.either` then reifies the typed failure into the success
// channel; `fromSafePromise` is safe because the promise can no longer reject.
const toolLoopEffectToResult = (
  effect: Effect.Effect<string, CesareError>,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromSafePromise(
    Effect.runPromise(
      effect.pipe(
        Effect.catchAllDefect((defect) =>
          Effect.fail(
            new CesareError(
              `Tool loop failed: ${defect instanceof Error ? defect.message : String(defect)}`,
            ),
          ),
        ),
        Effect.either,
      ),
    ),
  ).andThen((either) =>
    either._tag === "Right" ? okAsync(either.right) : errAsync(either.left),
  );

// ─── Legacy manual tool loop (MOCK_AI=true) ───────────────────────────────────
// Keeps the Playwright test suite working: the mock client emits Anthropic-style
// `tool_use` blocks, and the real executors run against the test DB. Once we
// have a mock LanguageModel provider, this path can be removed.
//
// Modelled as an `Effect`: the outer turn iteration stays an ordered, imperative
// `for` loop INSIDE `Effect.gen` (each iteration depends on the previous turn's
// messages — it is inherently sequential, never a candidate for `Effect.all`).
// Tool blocks within a turn execute STRICTLY SERIALLY (`Effect.forEach` with
// `concurrency: 1`) on purpose: the tracer invariant (CLAUDE.md) requires the
// `reading/writing` step events to surface in the model's intended order, and
// the agentic-edit pattern auto-versions then applies each mutation live — both
// would be corrupted by parallel execution against the same entity. Correctness
// over speed.

const runLegacyToolLoopEffect = (
  args: RunToolLoopArgs & { legacyMockClient: LegacyAnthropicClient },
): Effect.Effect<string, CesareError> =>
  Effect.gen(function* () {
    const MAX_ITERATIONS = 5;
    const currentMessages: Message[] = [...args.messages];
    const textAccumulator: string[] = [];
    let toolsExecuted = 0;
    let maxStepsHit = false;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Spec 48 (W-E2/W-E3) — honour interruption between iterations on the mock
      // path too: when the orchestrating fiber is interrupted, the bridged
      // signal aborts, and we stop the loop rather than leak further work. As an
      // Effect, raising the AbortError as a CesareError on the typed channel
      // mirrors the previous thrown DOMException (which `ResultAsync.fromPromise`
      // mapped to a CesareError), so the bridge sees the same failure.
      if (args.abortSignal?.aborted) {
        return yield* Effect.fail(new CesareError("Tool loop failed: aborted"));
      }
      const toolChoice =
        i === 0 && args.forcedFirstTool
          ? ({ type: "tool", name: args.forcedFirstTool } as const)
          : ({ type: "auto" } as const);
      const response = yield* Effect.tryPromise({
        try: () =>
          args.legacyMockClient.messages.create({
            model: args.model,
            max_tokens: 1500,
            system: args.systemPrompt,
            messages: currentMessages,
            tools: args.legacyTools ?? [],
            tool_choice: toolChoice,
          }),
        catch: (e) =>
          new CesareError(
            `Tool loop failed: ${e instanceof Error ? e.message : String(e)}`,
          ),
      });

      const toolBlocks = response.content.filter(isToolUseBlock);
      const textBlocks = response.content.filter(
        (b): b is { type: "text"; text: string } =>
          typeof b === "object" &&
          b !== null &&
          (b as { type: string }).type === "text",
      );

      for (const tb of textBlocks) {
        if (tb.text.trim()) {
          textAccumulator.push(tb.text.trim());
          args.onStreamEvent?.({ _tag: "reasoning", text: tb.text.trim() });
        }
      }

      if (response.stop_reason !== "tool_use" || toolBlocks.length === 0) {
        break;
      }

      if (i === MAX_ITERATIONS - 1) maxStepsHit = true;

      // Tool blocks within a turn run STRICTLY SERIALLY (`concurrency: 1`). This
      // is deliberate, not an oversight: parallelising them would scramble the
      // tracer step order (the `reading/writing` events the user watches live)
      // and race the agentic-edit auto-version+apply against the same entity.
      // Each step's side-effects (counter, `emitToolStep`, marker extraction)
      // therefore happen in the model's intended order. Correctness over speed.
      const toolResults: ToolResult[] = yield* Effect.forEach(
        toolBlocks,
        (block) =>
          fromResultAsync(args.executor(block, args.db, args.projectId)).pipe(
            Effect.map((value): ToolResult => {
              toolsExecuted += 1;
              emitToolStep(block.name, args.onStreamEvent);
              extractSideChannelMarkers(
                block.name,
                value.content,
                textAccumulator,
              );
              return value;
            }),
            // A tool error is not a turn failure: it becomes a `tool_result`
            // carrying the error so the model can recover — identical to the
            // previous `result.isErr()` branch.
            Effect.catchAll((error: CesareError) =>
              Effect.succeed<ToolResult>({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify({ error: error.message }),
              }),
            ),
          ),
        { concurrency: 1 },
      );

      currentMessages.push({ role: "assistant", content: response.content });
      currentMessages.push({ role: "user", content: toolResults });
    }

    if (maxStepsHit) {
      logger.warn(
        {
          stepCount: MAX_ITERATIONS,
          model: args.model,
          projectId: args.projectId,
        },
        "cesare.tool_loop.max_steps_hit",
      );
    }

    const marker = `<!--ohw:tools=${toolsExecuted}-->`;
    return `${repairMojibake(textAccumulator.join("\n\n"))}\n${marker}`;
  });

// ─── AI SDK generateText tool loop (production) ───────────────────────────────
// Converts the SystemPromptBlock[] (with cache_control) to the AI SDK
// SystemModelMessage[] format by mapping cache_control → providerOptions.

interface SystemPromptBlock {
  readonly type: "text";
  readonly text: string;
  readonly cache_control?: { readonly type: "ephemeral" };
}

const toSystemMessages = (
  systemPrompt: string | readonly unknown[],
):
  | string
  | Array<{
      role: "system";
      content: string;
      providerOptions?: Record<string, unknown>;
    }> => {
  if (typeof systemPrompt === "string") return systemPrompt;
  return (systemPrompt as readonly SystemPromptBlock[]).map((block) => ({
    role: "system" as const,
    content: block.text,
    ...(block.cache_control
      ? {
          providerOptions: {
            anthropic: { cacheControl: { type: block.cache_control.type } },
          },
        }
      : {}),
  }));
};

// The Anthropic ephemeral prompt-cache breakpoint.
//
// Anthropic caps a request at 4 cache breakpoints (a 5th+ is silently IGNORED,
// not rejected). The four system blocks that carry the cheapest, most static
// prefix already claim that budget in `cesare.server.ts` (ROLE, bible,
// production-context) plus this tool breakpoint — `buildToolGuidanceBlock` was
// deliberately UN-cached there to free a slot for the tool array, which is the
// single largest static payload and is re-sent on every one of the loop's
// 5 steps. Do NOT add a fifth breakpoint (e.g. on message history): it would be
// dropped on the floor while still appearing to "work" in isolation.
const EPHEMERAL_CACHE = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
} as const;

// Mark the LAST tool with the cache breakpoint. Anthropic caches the entire
// tool array up to (and including) the breakpoint, so a single mark on the
// final entry caches every tool definition. Order is preserved (cache requires
// a byte-identical prefix). The `anthropic` provider sub-object is deep-merged,
// not replaced, so a future tool-specific anthropic hint on the last tool is
// preserved. This also wraps the mock-model tools when MOCK_AI=true, which is
// harmless: the mock model ignores providerOptions (no real API, no cache).
export const withCachedTools = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdkTools: Record<string, Tool<any, any>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, Tool<any, any>> => {
  const names = Object.keys(sdkTools);
  if (names.length === 0) return sdkTools;
  const lastName = names[names.length - 1]!;
  const lastTool = sdkTools[lastName]!;
  const prior = (lastTool as { providerOptions?: Record<string, unknown> })
    .providerOptions;
  const priorAnthropic = (prior?.["anthropic"] ?? {}) as Record<
    string,
    unknown
  >;
  return {
    ...sdkTools,
    [lastName]: {
      ...lastTool,
      providerOptions: {
        ...prior,
        anthropic: { ...priorAnthropic, ...EPHEMERAL_CACHE.anthropic },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as Tool<any, any>,
  };
};

// Surface cache effectiveness as a structured log so a silent cache miss (a
// reordered prefix, a per-turn timestamp leaking into the cached blocks) is
// observable instead of invisibly billing full price. `cachedInputTokens` is
// the SDK's normalised read-hit count; the raw Anthropic write count lives in
// providerMetadata. The cost-smoke test asserts a hit on the warm second turn.
const logCacheUsage = (
  usage: Awaited<ReturnType<typeof streamText>["usage"]>,
  providerMetadata: Awaited<ReturnType<typeof streamText>["providerMetadata"]>,
  model: string,
  projectId: string,
): void => {
  const anthropicMeta = providerMetadata?.["anthropic"] as
    | { cacheCreationInputTokens?: number }
    | undefined;
  logger.info(
    {
      model,
      projectId,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      cacheReadTokens: usage.cachedInputTokens ?? 0,
      cacheWriteTokens: anthropicMeta?.cacheCreationInputTokens ?? 0,
    },
    "cesare.tool_loop.cache_usage",
  );
};

// ─── Production tool loop (AI SDK streamText) ─────────────────────────────────
//
// Modelled as an `Effect` over a SINGLE `streamText` call. There is no manual
// await-loop to parallelise here: the AI SDK owns the multi-step tool loop
// (`stopWhen: stepCountIs(5)`) AND already runs a step's independent tool
// `execute` callbacks concurrently itself. Wrapping it in `Effect.all` would be
// wrong — it is one async call — so this is `Effect.tryPromise`. The win at this
// layer is the typed error channel + interruption (the bridged AbortSignal),
// not concurrency; concurrency belongs to context assembly (W-E5), not the loop.
//
// Task 4 (streaming): generateText → streamText so the client can render the
// final reply's tokens as they arrive instead of waiting for the whole turn.
// onStepFinish's reasoning/tool-step/marker-extraction logic is UNCHANGED —
// streamText supports the identical callback. textStream additionally forwards
// text-delta events, additive to the existing step-trace contract. usage/
// finishReason/providerMetadata become promises that resolve once the stream
// drains, awaited below where generateText used to return them synchronously.
// BUG-101 — hard ceiling on the whole streamText consumption (up to 5 steps,
// each a model round-trip, plus tool execution). Sized above the nested
// callHaiku 45s bound so a legitimate multi-step turn with a from-scratch
// generation inside it isn't cut short, while still guaranteeing the turn can
// never hang unbounded and leave the tracer stuck.
const LOOP_TIMEOUT_MS = 90_000;

const runProductionToolLoopEffect = (
  args: RunToolLoopArgs,
): Effect.Effect<string, CesareError> => {
  // Resolve the language model: mock model when MOCK_AI=true, real Anthropic
  // model otherwise. Both paths go through the same streamText call.
  const resolvedModel = args.mockModel ?? anthropic(args.model);

  return Effect.tryPromise({
    try: async (): Promise<string> => {
      const textAccumulator: string[] = [];
      let toolsExecuted = 0;
      // Instrumentation only (no stopWhen change yet) — measure the real
      // step-count distribution in production before picking a lower cap
      // than the current stepCountIs(5).
      let stepCount = 0;

      // BUG-101 (second symptom) — bound the whole streamText consumption so a
      // turn can never hang unbounded. The nested callHaiku has its own 45s
      // bound; this covers the outer loop (multiple steps, so a larger ceiling).
      // Composed with the client abortSignal via AbortSignal.any so a client
      // cancel and the hard timeout both tear the request down. When it fires,
      // the fullStream loop below surfaces the abort as an `error` part → the
      // stream closes → `done`/END reach the client instead of hanging.
      const timeoutSignal = AbortSignal.timeout(LOOP_TIMEOUT_MS);
      const effectiveSignal = args.abortSignal
        ? AbortSignal.any([args.abortSignal, timeoutSignal])
        : timeoutSignal;

      const result = streamText({
        model: resolvedModel,
        system: toSystemMessages(args.systemPrompt) as Parameters<
          typeof streamText
        >[0]["system"],
        messages: args.messages as Parameters<
          typeof streamText
        >[0]["messages"] &
          [],
        // Cast needed: ToolSet constrains Tool<any,any> to Tool<never,never> union;
        // the runtime values are correct Tool instances, the variance is nominal.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: withCachedTools(args.sdkTools) as any,
        toolChoice: args.forcedFirstTool
          ? { type: "tool" as const, toolName: args.forcedFirstTool }
          : "auto",
        stopWhen: stepCountIs(5),
        maxOutputTokens: 1500,
        // Spec 48 (W-E2/W-E3) — when the orchestrating Effect fiber is
        // interrupted (client aborted the fetch), this signal aborts and the AI
        // SDK tears down the in-flight model request so no work leaks server-side.
        // BUG-101 — now also carries the hard-timeout signal (AbortSignal.any).
        abortSignal: effectiveSignal,
        // Spec 47e FIX 5 — telemetry gated on Langfuse being configured so dev
        // stays clean ("Not found" noise) when it isn't.
        experimental_telemetry: aiTelemetry("cesare-tool-loop"),
        onStepFinish: (stepResult) => {
          stepCount += 1;
          // Collect text produced in each step
          for (const part of stepResult.text
            ? [{ text: stepResult.text }]
            : []) {
            if (part.text.trim()) {
              textAccumulator.push(part.text.trim());
              // Spec 47a — surface the model's planning text as a live
              // `reasoning` step so the trace shows progress before any tool
              // resolves.
              args.onStreamEvent?.({
                _tag: "reasoning",
                text: part.text.trim(),
              });
            }
          }
          // Count tool invocations, emit live step events, extract markers.
          for (const toolCall of stepResult.toolCalls ?? []) {
            const toolResult = (stepResult.toolResults ?? []).find(
              (r) => r.toolCallId === toolCall.toolCallId,
            );
            if (toolResult) {
              toolsExecuted += 1;
              emitToolStep(toolCall.toolName, args.onStreamEvent);
              extractSideChannelMarkers(
                toolCall.toolName,
                JSON.stringify(toolResult.output),
                textAccumulator,
              );
            }
          }
        },
      });

      // Forward token deltas as they arrive — additive to the reasoning/tool
      // events onStepFinish already emits above.
      //
      // BUG-101 (second symptom) — this loop MUST consume `fullStream`, not
      // `textStream`. On a tool-only final step (the model ran a tool, e.g. the
      // Scaletta doc-edit, and emitted NO closing text) `textStream` yields zero
      // deltas for that step and its async iterator may never terminate — so the
      // `for await` never completed, the outer promise never resolved, and the
      // client's tracer sat on "STO SCRIVENDO Scaletta" forever with no `done`.
      // `fullStream` always emits `finish-step`/`finish` and closes cleanly after
      // the last step regardless of whether it produced text, so the loop is
      // guaranteed to terminate. We still forward ONLY `text-delta` parts to keep
      // the client's `text-delta` event contract byte-for-byte identical; the
      // step trace (reasoning/tool) keeps coming from onStepFinish above.
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          if (part.text.length > 0) {
            args.onStreamEvent?.({ _tag: "text-delta", text: part.text });
          }
        } else if (part.type === "error") {
          // Surface the error so the stream can close and the client is
          // released (it closes on the `error`/`done`/END signals). Re-throw so
          // the outer Effect.tryPromise maps it to a CesareError.
          throw part.error instanceof Error
            ? part.error
            : new Error(String(part.error));
        }
      }

      const [usage, providerMetadata, finishReason, text] = await Promise.all([
        result.usage,
        result.providerMetadata,
        result.finishReason,
        result.text,
      ]);

      logCacheUsage(usage, providerMetadata, args.model, args.projectId);
      logger.info(
        {
          model: args.model,
          projectId: args.projectId,
          stepCount,
          finishReason,
        },
        "cesare.tool_loop.step_usage",
      );

      // Collect final text if not already captured in onStepFinish
      if (text.trim() && !textAccumulator.includes(text.trim())) {
        textAccumulator.push(text.trim());
      }

      if (finishReason === "length") {
        logger.warn(
          { model: args.model, projectId: args.projectId },
          "cesare.tool_loop.max_steps_hit",
        );
      }

      // A tool-only turn (the model ran a tool but emitted no closing text) would
      // otherwise render as a BLANK bubble — the user sees a spinner resolve to
      // nothing. The reply the CLIENT renders is `textAccumulator` MINUS every
      // `<!--ohw:…-->` marker (the client strips them). So the real test is not
      // "accumulator empty" but "nothing VISIBLE after markers are removed": a
      // turn that pushed only markers (a proposal that didn't render, an edit
      // marker) still shows an empty bubble. Compute the visible text and, when
      // it's empty but tools ran, add an honest one-liner.
      //
      // Honesty (bug N3): reserve any "trovi le modifiche nell'editor" phrasing
      // for when a real apply/proposal marker landed; otherwise say plainly that
      // nothing visible was applied — never claim a change the user can't see.
      const joinedText = textAccumulator.join("\n");
      const visibleText = joinedText.replace(/<!--ohw:[\s\S]*?-->/g, "").trim();
      if (visibleText.length === 0 && toolsExecuted > 0) {
        textAccumulator.push(markerAwareFallbackText(joinedText));
      }

      const marker = `<!--ohw:tools=${toolsExecuted}-->`;
      return `${repairMojibake(textAccumulator.join("\n\n"))}\n${marker}`;
    },
    catch: (e) =>
      new CesareError(
        `Tool loop failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  });
};

// Fallback bubble for a marker-only turn, matched to the affordance the marker
// actually renders. The ✓/✕ overlay exists ONLY for screenplay inline
// proposals — telling the user to look for it after a narrative ask/apply is a
// lie ("non vedo la x", 2026-07-02): the ask card has its own buttons, and an
// applied edit is already live in the editor with its checkpoint in Versioni.
export const markerAwareFallbackText = (joinedText: string): string => {
  if (joinedText.includes("<!--ohw:ask-new-version"))
    return "Come vuoi applicare la modifica? Scegli qui sotto: sovrascrivi la versione corrente oppure creane una nuova.";
  if (
    joinedText.includes("<!--ohw:doc-applied") ||
    joinedText.includes("<!--ohw:entity-applied")
  )
    return "Fatto — la modifica è già applicata nell'editor. Puoi sempre tornare alla versione precedente da Versioni.";
  if (joinedText.includes("<!--ohw:"))
    return "Fatto — vedi la proposta nell'editor. Accetta con ✓ o rifiuta con ✕.";
  return "Ho provato a eseguire la richiesta, ma non è stata applicata alcuna modifica visibile nell'editor. Riprova o riformula la richiesta.";
};

// Dispatch the tool loop as an `Effect`: the legacy manual loop (MOCK_AI without
// a mock model) or the production `generateText` loop. Internal to this module;
// the public `runGenericToolLoop` bridges it back to `ResultAsync` at the seam.
const runToolLoopEffect = (
  args: RunToolLoopArgs,
): Effect.Effect<string, CesareError> =>
  !args.mockModel && args.legacyMockClient
    ? runLegacyToolLoopEffect(
        args as RunToolLoopArgs & { legacyMockClient: LegacyAnthropicClient },
      )
    : runProductionToolLoopEffect(args);

const runGenericToolLoop = (
  args: RunToolLoopArgs,
): ResultAsync<string, CesareError> =>
  toolLoopEffectToResult(runToolLoopEffect(args));

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

// ─── Budget tools factory (AI SDK v5 format) ──────────────────────────────────

const TOP_SHEET_ENUM = [
  "above_the_line",
  "production",
  "crew",
  "post_production",
  "contingency",
] as const;

export const createBudgetTools = (db: Db, projectId: string) => ({
  update_budget_line: tool({
    description:
      "Aggiorna un singolo campo di una riga del budget esistente. " +
      "Campi consentiti: 'rate' (importo unitario in euro), 'quantity' (numero di unita), " +
      "'actual' (spesa effettiva consuntivata in euro), 'notes' (testo libero). " +
      "Usa questo tool quando l'utente chiede di modificare una voce specifica. " +
      "Il line_id deve essere quello di una riga esistente nel budget del progetto corrente.",
    inputSchema: z.object({
      line_id: z.string().describe("UUID della riga budget"),
      field: z
        .enum(["rate", "quantity", "actual", "notes"])
        .describe("Campo da aggiornare"),
      value: z
        .unknown()
        .describe(
          "Nuovo valore. Numero per rate/quantity/actual, stringa per notes. " +
            "Passa null per azzerare actual/rate/quantity.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeUpdateBudgetLine(
        input as UpdateBudgetLineInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  add_budget_line: tool({
    description:
      "Aggiunge una nuova voce di costo a un top sheet esistente. " +
      "I top sheet ammessi sono: 'above_the_line', 'production', 'crew', 'post_production', 'contingency'. " +
      "Usa questo tool quando l'utente chiede di inserire una voce che manca (es. 'aggiungi catering').",
    inputSchema: z.object({
      top_sheet: z
        .enum(TOP_SHEET_ENUM)
        .describe("Categoria top sheet a cui appartiene la nuova voce"),
      description: z.string().describe("Nome/descrizione della voce"),
      rate: z.number().describe("Importo unitario in euro"),
      quantity: z.number().optional().describe("Numero di unita (default 1)"),
      linked_category: z
        .string()
        .optional()
        .describe(
          "Categoria di breakdown collegata (opzionale, es. 'props', 'vehicles', 'locations')",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeAddBudgetLine(
        input as AddBudgetLineInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  redistribute_topsheet: tool({
    description:
      "Sposta un importo in euro da un top sheet a un altro. " +
      "Strategia: abbassa il rate*quantity della riga piu costosa di 'from_top_sheet' " +
      "fino a ridurre l'allocazione di 'amount' euro (riducendo il rate, mai sotto zero). " +
      "Poi aggiunge una riga 'Contingenza riallocata da <from_top_sheet>' nel 'to_top_sheet' " +
      "(o incrementa una riga simile preesistente). " +
      "Limite: se la riga piu grande non basta a coprire 'amount', il tool ritorna un errore e Cesare deve proporre un piano in piu step. " +
      "Non tocca righe 'cast' o 'crew' a livello di risorsa (budgetCast/budgetCrew): opera solo su budget_lines.",
    inputSchema: z.object({
      from_top_sheet: z.enum(TOP_SHEET_ENUM),
      to_top_sheet: z.enum(TOP_SHEET_ENUM),
      amount: z.number().describe("Importo in euro da spostare"),
    }),
    execute: async (input, _opts) => {
      const result = await executeRedistributeTopsheet(
        input as RedistributeInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  analyze_variance: tool({
    description:
      "Report deterministico (read-only, niente inferenza AI) sullo stato del budget: " +
      "top 3 righe piu sopra-budget (actual > rate*quantity), " +
      "top 3 righe piu sotto-budget (actual < rate*quantity con consuntivo presente), " +
      "top sheet con residuo negativo. " +
      "Usa questo tool quando l'utente chiede 'analizza il budget', 'dove sto sforando', 'a che punto siamo'.",
    inputSchema: z.object({}),
    execute: async (_input, _opts) => {
      const result = await executeAnalyzeVariance(db, projectId);
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  mark_line_actual: tool({
    description:
      "Imposta l'importo effettivamente speso ('actual') su una riga budget per la riconciliazione. " +
      "Usa questo tool quando l'utente comunica una spesa reale (es. 'la trattoria e costata 320 euro').",
    inputSchema: z.object({
      line_id: z.string().describe("UUID della riga budget"),
      actual_amount: z.number().describe("Importo speso in euro (>= 0)"),
    }),
    execute: async (input, _opts) => {
      const result = await executeMarkLineActual(
        input as MarkLineActualInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  set_budget_cap: tool({
    description:
      "Imposta un tetto di spesa (cap) per il progetto. " +
      "Scope 'global' = tetto complessivo del budget. " +
      "Scope 'topsheet' = tetto per uno specifico top sheet (es. cast, production, post_production). " +
      "Usa questo tool quando l'utente chiede 'non superare X' o 'il cast non puo costare piu di Y'.",
    inputSchema: z.object({
      scope: z.union([
        z.object({ kind: z.literal("global") }),
        z.object({
          kind: z.literal("topsheet"),
          top_sheet: z.enum(TOP_SHEET_ENUM),
        }),
      ]),
      amount_cents: z
        .number()
        .describe("Tetto in centesimi (es. 5000000 per €50.000)."),
    }),
    execute: async (input, _opts) => {
      const result = await executeSetBudgetCap(
        input as SetBudgetCapInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  evaluate_against_cap: tool({
    description:
      "Legge i cap correnti (globale + per topsheet) e li confronta con l'allocazione di budget effettiva. " +
      "Ritorna residuo e top sheet che sforano. Pure read — non muta nulla. " +
      "Usa questo tool per 'siamo dentro budget?' o 'quanto rimane?'.",
    inputSchema: z.object({}),
    execute: async (_input, _opts) => {
      const result = await executeEvaluateAgainstCap(db, projectId);
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  propose_excessive_lines_flags: tool({
    description:
      "Analizza le voci di budget e segnala quelle anomale: >150% della media della loro categoria. " +
      "Ritorna la lista flaggata — NON muta nulla. L'utente decide se intervenire. " +
      "Usa questo tool per 'ci sono voci eccessive?' o 'cosa costa troppo?'.",
    inputSchema: z.object({
      threshold_ratio: z
        .number()
        .optional()
        .describe("Soglia opzionale (default 1.5 = 150% della media)"),
    }),
    execute: async (input, _opts) => {
      const result = await executeProposeExcessiveLines(
        input as ExcessiveLinesInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
  propose_missing_lines: tool({
    description:
      "Analizza il breakdown delle scene richieste e propone voci budget potenzialmente mancanti. " +
      "Ritorna la lista delle categorie scoperte con nomi e stime di default — NON muta nulla. " +
      "Usa questo tool quando l'utente chiede 'cosa manca nel budget?' o 'verifica copertura'.",
    inputSchema: z.object({
      scene_ids: z
        .array(z.string())
        .optional()
        .describe(
          "UUID delle scene da analizzare. Omesso = analizza l'intero progetto.",
        ),
    }),
    execute: async (input, _opts) => {
      const result = await executeProposeMissingLines(
        input as MissingLinesInput,
        db,
        projectId,
      );
      if (result.isErr()) return { error: result.error.message };
      return result.value;
    },
  }),
});

export type BudgetTools = ReturnType<typeof createBudgetTools>;

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
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
): ResultAsync<string, CesareError> =>
  runGenericToolLoop({
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    sdkTools: {
      ...createBudgetTools(db, projectId),
      ...createReadTools(db, projectId),
    },
    legacyTools: [
      ...CESARE_BUDGET_TOOLS,
      ...CESARE_READ_TOOLS,
    ] as unknown as readonly unknown[],
    mockModel: resolveMockModel(),
    legacyMockClient: resolveMockClient(),
    executor: executeBudgetTool,
  });

// ─── Legacy-to-AI-SDK tool bridge ─────────────────────────────────────────────
// Converts AnthropicTool[] (input_schema format) to AI SDK Tool objects with
// inline execute callbacks that delegate to a SkillExecutor. This lets
// runUnifiedToolLoop use generateText (the AI SDK path) without requiring every
// skill to migrate its tool definitions to the Zod factory format first.

const bridgeLegacyTools = (
  legacyTools: readonly AnthropicTool[],
  executor: SkillExecutor,
  db: Db,
  projectId: string,
  access: ProjectAccess,
  // BUG-101/#103 — the live trace sink. The document generators run a nested
  // model call inside the executor (runGeneration). We emit the "STO SCRIVENDO
  // Scaletta" step eagerly the instant the tool starts (below), then stream the
  // generation's tokens live: `onDelta` forwards each chunk as a `gen-delta`
  // event (NOT `text-delta` — gen-delta feeds the tracer's writing-step preview,
  // never the chat bubble, so the raw document stays behind the chat) so scenes
  // appear progressively in the tracer instead of after the whole ~40s
  // generation returns. Only the document-gen executor consumes `onDelta`; every
  // other executor ignores the optional param.
  onStreamEvent?: (event: CesareStreamEvent) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, Tool<any, any>> =>
  Object.fromEntries(
    legacyTools.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: jsonSchema(
          t.input_schema as Parameters<typeof jsonSchema>[0],
        ),
        execute: async (input, opts) => {
          // Surface the step the instant the tool starts, so a slow nested
          // generation shows "sto scrivendo …" immediately rather than after it
          // finishes. onStepFinish still emits the authoritative step later; the
          // client's reducer dedupes a repeated step, so the eager one is free.
          emitToolStep(t.name, onStreamEvent);
          const block: ToolUseBlock = {
            type: "tool_use",
            id: opts.toolCallId,
            name: t.name,
            input,
          };
          // #103 — forward nested-generation tokens as `gen-delta` (NOT
          // text-delta): they feed the tracer's writing-step preview, never the
          // chat bubble. Each event carries only the INCREMENTAL chunk (the
          // client appends + tail-caps), so a 6k-char screenplay streams O(n)
          // bytes, not O(n²) from re-sending the whole text-so-far each chunk.
          const onDelta = onStreamEvent
            ? (chunk: string) =>
                onStreamEvent({ _tag: "gen-delta", text: chunk })
            : undefined;
          const result = await executor(block, db, projectId, access, onDelta);
          if (result.isErr()) return { error: result.error.message };
          try {
            return JSON.parse(result.value.content) as unknown;
          } catch {
            return { raw: result.value.content };
          }
        },
      }),
    ]),
  );

// ─── Unified tool loop (spec 39) ──────────────────────────────────────────────
// Parameterised on a SkillExecutor from the registry instead of a page-specific
// executor. Bridges the legacy AnthropicTool[] wire format to AI SDK Tool
// objects so generateText can drive the loop — same path as runGenericToolLoop.

export const runUnifiedToolLoop = (
  systemPrompt: string | readonly unknown[],
  messages: Message[],
  tools: readonly unknown[],
  executor: SkillExecutor,
  db: Db,
  projectId: string,
  access: ProjectAccess,
  model: string,
  onStreamEvent?: (event: CesareStreamEvent) => void,
  forcedFirstTool?: string,
  abortSignal?: AbortSignal,
): ResultAsync<string, CesareError> => {
  const sdkTools = bridgeLegacyTools(
    tools as readonly AnthropicTool[],
    executor,
    db,
    projectId,
    access,
    onStreamEvent,
  );
  return runGenericToolLoop({
    systemPrompt,
    messages,
    db,
    projectId,
    model,
    sdkTools,
    mockModel: resolveMockModel(),
    executor: (block, dbArg, projectIdArg) =>
      executor(block, dbArg, projectIdArg, access),
    ...(onStreamEvent ? { onStreamEvent } : {}),
    ...(forcedFirstTool ? { forcedFirstTool } : {}),
    ...(abortSignal ? { abortSignal } : {}),
  });
};
