import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ResultAsync, err, ok } from "neverthrow";
import { match } from "ts-pattern";
import { screenplays } from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import {
  DbError,
  ForbiddenError,
  ScreenplayNotFoundError,
} from "../screenplay.errors";
import { callHaiku, extractToolUse } from "~/features/ai";

// ─── Polish suggestions: tipologie e schemi ──────────────────────────────────
// Polish è la "Cesare di scrittura": leggere la sceneggiatura e proporre
// piccole rifiniture al testo (dialoghi che suonano lunghi, descrizioni
// telegrafiche, beat di pacing, refusi di formato). Risultato pensato per
// vivere nel pannello laterale dello Screenplay come lista cortissima.

const PolishSuggestionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "dialogue",
    "action",
    "structure",
    "pacing",
    "style",
    "format",
  ]),
  severity: z.enum(["info", "suggestion", "warning"]),
  /** 1-indexed scene number the suggestion refers to. */
  scene: z.number().int().positive(),
  /** Short message (≤ 140 chars), Italian, action-oriented. */
  message: z.string().min(1).max(280),
  /** Tiny snippet (≤ 80 chars) from the screenplay quoted by Cesare. */
  snippet: z.string().max(160).nullable(),
});

const PolishResponseSchema = z.object({
  suggestions: z.array(PolishSuggestionSchema).max(20),
});

export type PolishSuggestion = z.infer<typeof PolishSuggestionSchema>;

const POLISH_TOOL_NAME = "submit_polish_suggestions";

const POLISH_TOOL: {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
} = {
  name: POLISH_TOOL_NAME,
  description:
    "Restituisci una lista corta di rifiniture per la sceneggiatura: pacing, ritmi dei dialoghi, descrizioni telegrafiche, refusi di formato. Massimo 6 voci, ordinate per impatto.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            kind: {
              type: "string",
              enum: [
                "dialogue",
                "action",
                "structure",
                "pacing",
                "style",
                "format",
              ],
            },
            severity: {
              type: "string",
              enum: ["info", "suggestion", "warning"],
            },
            scene: { type: "integer", minimum: 1 },
            message: { type: "string", maxLength: 280 },
            snippet: { type: "string", maxLength: 160 },
          },
          required: ["id", "kind", "severity", "scene", "message"],
        },
      },
    },
    required: ["suggestions"],
  },
};

const POLISH_SYSTEM_PROMPT = `Sei Cesare, dramaturg italiano sobrio. Stai leggendo una scrittura in formato Fountain.
Restituisci da 3 a 6 suggerimenti di polish concreti, in italiano, ognuno ≤ 140 caratteri.
Riferisci ogni suggerimento alla scena (numero 1-indexato basato su INT./EXT.).
Niente complimenti. Niente generiche "rivedi il dialogo": indica COSA e PERCHÉ.
Esempi di good output:
- pacing: "Scena 3: la battuta di JOHN dura 6 righe, perde il ritmo da open-mic — taglia metà o spezza con risata del pubblico."
- format: "Scena 2: 'sarria' è dialetto: meta corsivo o (in dialetto) per il lettore."
- action: "Scena 5: descrizione 'cucina, ferito, pugno' è telegrafica — un beat di mezza riga aiuta la regia."
Non inventare elementi che non sono nel testo.`;

export const getScreenplayPolish = createServerFn({ method: "GET" })
  .validator(z.object({ screenplayId: z.string().uuid() }))
  .handler(
    async ({
      data,
    }): Promise<
      ResultShape<
        { suggestions: PolishSuggestion[] },
        ScreenplayNotFoundError | ForbiddenError | DbError
      >
    > => {
      await requireUser();
      const db = await getDb();

      const spResult = await ResultAsync.fromPromise(
        db.query.screenplays
          .findFirst({ where: eq(screenplays.id, data.screenplayId) })
          .then((r) => r ?? null),
        (e) => new DbError("polish/loadScreenplay", e),
      );
      if (spResult.isErr()) return toShape(err(spResult.error));
      if (!spResult.value)
        return toShape(err(new ScreenplayNotFoundError(data.screenplayId)));

      const content = spResult.value.content;
      const wantsMock =
        process.env["MOCK_AI"] === "true" ||
        !process.env["ANTHROPIC_API_KEY"];

      const suggestions: PolishSuggestion[] = wantsMock
        ? mockPolishForContent(content)
        : await callPolish(content);

      return toShape(ok({ suggestions }));
    },
  );

const callPolish = async (content: string): Promise<PolishSuggestion[]> => {
  // Trim to keep tokens predictable: most polish comes from the first ~6
  // scenes anyway. The agent gets up to ~8k characters.
  const trimmed = content.slice(0, 8000);
  const result = await callHaiku(
    {
      system: POLISH_SYSTEM_PROMPT,
      fewShot: [],
      user: trimmed,
      maxTokens: 1024,
      tools: [POLISH_TOOL],
      toolChoice: { type: "tool", name: POLISH_TOOL_NAME },
    },
    "cesare/polish",
  );
  if (result.isErr()) return [];
  const input = extractToolUse(result.value.content, POLISH_TOOL_NAME);
  if (input === null) return [];
  const parsed = PolishResponseSchema.safeParse(input);
  return parsed.success ? parsed.data.suggestions : [];
};

// ─── Mock fallback per MOCK_AI=true / chiave mancante ────────────────────────
// Genera suggerimenti deterministici basati sul contenuto, così la UI ha
// sempre qualcosa di realistico da mostrare anche senza API key.
const mockPolishForContent = (content: string): PolishSuggestion[] => {
  const sceneHeadings = content
    .split("\n")
    .map((l, i) => ({ line: l, idx: i }))
    .filter((x) => /^(INT|EST|EXT|INT\/EXT)\./i.test(x.line.trim()))
    .map((x, i) => ({ ...x, sceneNum: i + 1, heading: x.line.trim() }));

  if (sceneHeadings.length === 0) {
    return [
      {
        id: "polish-empty-1",
        kind: "structure",
        severity: "info",
        scene: 1,
        message:
          "Manca una scene heading INT./EXT. all'inizio — il primo blocco è quello che imposta il tono.",
        snippet: null,
      },
    ];
  }

  const out: PolishSuggestion[] = [];
  const sample = sceneHeadings.slice(0, 5);
  sample.forEach((s, i) => {
    const message = match(i % 4)
      .with(0, () =>
        `Scena ${s.sceneNum}: l'heading "${s.heading.slice(0, 60)}" è chiaro — assicurati che il tempo (NOTTE/GIORNO) sia coerente con la luce descritta.`,
      )
      .with(1, () =>
        `Scena ${s.sceneNum}: introduzione del personaggio. Aggiungi età solo alla prima apparizione, non a ogni rientro.`,
      )
      .with(2, () =>
        `Scena ${s.sceneNum}: occhio al pacing — se ci sono più di 4 righe di azione consecutive considera di spezzare con un beat o un dialogo.`,
      )
      .otherwise(() =>
        `Scena ${s.sceneNum}: i dialoghi in dialetto vanno marcati (in dialetto) la prima volta e poi liberi.`,
      );
    out.push({
      id: `polish-mock-${s.sceneNum}-${i}`,
      kind: match(i % 4)
        .with(0, () => "format" as const)
        .with(1, () => "style" as const)
        .with(2, () => "pacing" as const)
        .otherwise(() => "dialogue" as const),
      severity: i === 0 ? "info" : i % 3 === 0 ? "warning" : "suggestion",
      scene: s.sceneNum,
      message,
      snippet: s.heading.slice(0, 80),
    });
  });
  return out;
};

export const polishQueryOptions = (screenplayId: string) => ({
  queryKey: ["screenplay-polish", screenplayId] as const,
  queryFn: async (): Promise<{ suggestions: PolishSuggestion[] }> => {
    const r = await getScreenplayPolish({ data: { screenplayId } });
    if (!r.isOk) return { suggestions: [] };
    return r.value;
  },
  // Polish is heavy + expensive on token budget — refresh every 5 minutes,
  // not on every keystroke. The user can also manually refresh via a button.
  staleTime: 5 * 60 * 1000,
  enabled: screenplayId.length > 0,
});
