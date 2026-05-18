import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { eq, and } from "drizzle-orm";
import { locationCandidates, locationRequirements } from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import { CesareError } from "./cesare.server";

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
      "Usa questo tool dopo search_places per salvare i risultati rilevanti.",
    input_schema: {
      type: "object" as const,
      properties: {
        requirement_id: {
          type: "string",
          description: "UUID del location requirement a cui aggiungere il candidato",
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
      },
      required: ["requirement_id", "name"],
    },
  },
] as const;

// ─── Google Places types ──────────────────────────────────────────────────────

export interface PlaceResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId: string;
  types: string[];
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
              "places.displayName,places.formattedAddress,places.location,places.id,places.types",
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
}

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
  typeof b === "object" && b !== null && (b as ToolUseBlock).type === "tool_use";

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

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
          JSON.stringify({ error: "requirement_id missing — cannot add candidate without a selected location requirement" }),
        ),
      );
    }
    return executeAddCandidate(input, db, projectId).map((result) =>
      successResult(block.id, JSON.stringify(result)),
    );
  }

  return okAsync(
    successResult(block.id, JSON.stringify({ error: `Unknown tool: ${block.name}` })),
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
  systemPrompt: string,
  messages: Message[],
  db: Db,
  projectId: string,
  model: string,
  fallbackRequirementId: string | null = null,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    (async (): Promise<string> => {
      const MAX_ITERATIONS = 5;
      const currentMessages: Message[] = [...messages];
      const textAccumulator: string[] = [];

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const response = await client.messages.create({
          model,
          max_tokens: 1500,
          system: systemPrompt,
          messages: currentMessages,
          tools: CESARE_LOCATION_TOOLS,
        });

        const toolBlocks = response.content.filter(isToolUseBlock);
        const textBlocks = response.content.filter(
          (b): b is { type: "text"; text: string } =>
            typeof b === "object" && b !== null && (b as { type: string }).type === "text",
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
          const result = await executeTool(block, db, projectId, fallbackRequirementId);
          if (result.isErr()) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify({ error: result.error.message }),
            });
          } else {
            toolResults.push(result.value);
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

      return textAccumulator.join("\n\n");
    })(),
    (e) =>
      new CesareError(
        `Tool loop failed: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );
