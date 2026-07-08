// apps/web/app/features/predictions/cesare-stream-events.ts
//
// Spec 47a (A2) — typed step events for the streamed Cesare transport.
//
// The server emits these as newline-delimited JSON over a ReadableStream while
// the tool loop runs; the client parses each line back into this union and
// reduces it into the live trace. The `_tag` discriminant lets ts-pattern match
// without `instanceof`, and Zod is the single source of truth for the shape on
// both sides of the wire.
import { z } from "zod";

/** The domains a step event can touch. Mirrors the Cesare page set so a
 *  cross-domain write (e.g. a Sceneggiatura request that writes the Soggetto)
 *  is expressible: the `tool` step maps to its TARGET domain, independent of
 *  the page the user is on. */
export const StreamEntityDomainSchema = z.enum([
  "logline",
  "soggetto",
  "synopsis",
  "outline",
  "treatment",
  "screenplay",
  "breakdown",
  "budget",
  "schedule",
  "shooting-plan",
  "locations",
]);

export type StreamEntityDomain = z.infer<typeof StreamEntityDomainSchema>;

export const EntityRefSchema = z.object({
  domain: StreamEntityDomainSchema,
  /** User-facing IT label, e.g. "Soggetto", "Sceneggiatura", "Sc.2". */
  label: z.string().min(1),
});

export type EntityRef = z.infer<typeof EntityRefSchema>;

/**
 * Discriminated union of every step event the Cesare stream can emit.
 *
 * - `reasoning`  — a thought / planning step (no entity touched yet).
 * - `reading`    — Cesare is reading an entity for context.
 * - `writing`    — Cesare is mutating an entity (the cross-domain target).
 * - `tool`       — a raw tool invocation (used when no entity mapping applies).
 * - `text-delta` — Task 4 (streaming) — an incremental chunk of the model's
 *                  final reply text, emitted as it's generated so the client
 *                  can render tokens progressively instead of waiting for
 *                  `done`. Additive to the existing step-trace contract —
 *                  reasoning/reading/writing/tool events are unchanged.
 * - `done`       — terminal: carries the final assistant text (still embedding
 *                  the legacy `<!--ohw:…-->` markers) + the tool count.
 * - `error`      — terminal: the run failed; carries a user-facing message.
 */
export const CesareStreamEventSchema = z.discriminatedUnion("_tag", [
  z.object({ _tag: z.literal("reasoning"), text: z.string() }),
  z.object({ _tag: z.literal("reading"), entity: EntityRefSchema }),
  z.object({ _tag: z.literal("writing"), entity: EntityRefSchema }),
  z.object({ _tag: z.literal("tool"), name: z.string().min(1) }),
  z.object({ _tag: z.literal("text-delta"), text: z.string() }),
  z.object({
    _tag: z.literal("done"),
    result: z.string(),
    toolsExecuted: z.number().int().nonnegative(),
  }),
  z.object({ _tag: z.literal("error"), message: z.string() }),
]);

export type CesareStreamEvent = z.infer<typeof CesareStreamEventSchema>;

/** Serialise one event to a single NDJSON line (trailing newline included). */
export const encodeStreamEvent = (event: CesareStreamEvent): string =>
  `${JSON.stringify(event)}\n`;

/**
 * Read the `<!--ohw:tools=N-->` marker the tool loop embeds in the final reply.
 * Lives here (not in the React component) so both the streaming route and the
 * client transport can read it without importing UI code. Returns 0 when the
 * marker is absent.
 */
export const parseToolsExecutedMarker = (content: string): number => {
  const m = content.match(/<!--ohw:tools=(\d+)-->/);
  return m ? parseInt(m[1] ?? "0", 10) : 0;
};

/**
 * Parse one NDJSON line into an event. Returns `null` for blank lines or
 * malformed JSON so the client transport can skip noise without throwing
 * (errors are values — a bad line is an expected, recoverable condition).
 */
export const parseStreamEventLine = (
  line: string,
): CesareStreamEvent | null => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const parsed = CesareStreamEventSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
};
