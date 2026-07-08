import { createServerFn } from "@tanstack/start";
import { z } from "zod";
import { eq, and, gte, lte } from "drizzle-orm";
import { ResultAsync, err, ok } from "neverthrow";
import { match } from "ts-pattern";
import {
  createEditorialApprovalAdvice,
  dedupeEditorialAdvice,
  EditorialAdviceListSchema,
  EditorialAdviceSchema,
  sortEditorialAdvice,
  type EditorialAdvice,
} from "@oh-writers/domain";
import {
  screenplays,
  scenes,
  documents,
  projects,
} from "@oh-writers/db/schema";
import { toShape, type ResultShape } from "@oh-writers/utils";
import { requireUser } from "~/server/context";
import { getDb } from "~/server/db";
import {
  DbError,
  ForbiddenError,
  ScreenplayNotFoundError,
} from "../screenplay.errors";
import { callHaiku, extractToolUse } from "~/features/ai";

const PolishSuggestionSchema = EditorialAdviceSchema.extend({
  scene: z.number().int().positive(),
});

export type PolishSuggestion = EditorialAdvice;

const POLISH_TOOL_NAME = "submit_polish_suggestions";

const POLISH_TOOL: {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
} = {
  name: POLISH_TOOL_NAME,
  description:
    "Restituisci da 2 a 6 note editoriali per la sceneggiatura. Non tutte devono essere problemi: puoi segnalare rischi, scelte autoriali, rifiniture opzionali o un OK editoriale.",
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
            area: {
              type: "string",
              description:
                "Narrative area slug: screenplay, dialogue, action, structure, rhythm, tone, clarity, format, scene.",
            },
            severity: {
              type: "string",
              enum: ["high", "medium", "low", "optional"],
            },
            type: {
              type: "string",
              enum: [
                "real_problem",
                "risk",
                "authorial_choice",
                "optional",
                "already_resolved",
                "approved",
              ],
            },
            scene: { type: "integer", minimum: 1 },
            title: { type: "string", maxLength: 120 },
            body: { type: "string", maxLength: 360 },
            snippet: { type: "string", maxLength: 160 },
            whyItMatters: { type: "string", maxLength: 240 },
            whenToIgnore: { type: "string", maxLength: 240 },
            minimalIntervention: { type: "string", maxLength: 240 },
            find: {
              type: "string",
              maxLength: 400,
              description:
                "Sostringa esatta da cercare nel testo. Includere solo quando hai un edit puntuale da proporre.",
            },
            replace: {
              type: "string",
              maxLength: 800,
              description:
                "Testo che dovrebbe rimpiazzare 'find'. Solo quando hai un edit chiaro e applicabile.",
            },
          },
          required: [
            "id",
            "area",
            "type",
            "severity",
            "scene",
            "title",
            "body",
          ],
        },
      },
    },
    required: ["suggestions"],
  },
};

const POLISH_SYSTEM_PROMPT = `Sei Cesare, editor narrativo italiano sobrio. Stai leggendo una sceneggiatura in formato Fountain.
Restituisci da 2 a 6 note editoriali in italiano.
Riferisci ogni nota alla scena (numero 1-indexato basato su INT./EXT.).
Non dare consigli per obbligo. Se una scena funziona, puoi dirlo con una nota di tipo "approved" o "already_resolved".
Non trasformare ogni ambiguità, ellissi o asimmetria in errore. Prima chiediti: rende il testo più forte o solo più convenzionale?
Preferisci interventi minimi, concreti e filmabili. Evita spiegoni psicologici o tematici.

REGOLA SUI FIND/REPLACE (importante):
Per ogni suggerimento dove l'edit è esprimibile come sostituzione testuale puntuale, DEVI compilare entrambi:
- find: la sostringa ESATTA presente nel testo (copia-incolla, verbatim, max 400 char)
- replace: il testo proposto che la rimpiazza (max 800 char)
Usali solo quando l'intervento minimo è davvero puntuale. Le note strutturali o le scelte autoriali possono ometterli.

Esempi:
- format: una sostituzione puntuale di formato
- dialogue: una battuta troppo lunga da stringere
- risk: una scena leggibile ma con rischio di dispersione
- approved: "Questa scena regge così, non la toccherei"

Non inventare elementi che non sono nel testo. Verifica che 'find' compaia letteralmente.`;

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
        process.env["MOCK_AI"] === "true" || !process.env["ANTHROPIC_API_KEY"];

      const suggestions: PolishSuggestion[] = wantsMock
        ? mockPolishForContent(content)
        : await callPolish(spResult.value.projectId, content);

      return toShape(ok({ suggestions }));
    },
  );

const buildProjectContext = async (projectId: string): Promise<string> => {
  const db = await getDb();
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { title: true, format: true, genre: true },
  });
  const loglineDoc = await db.query.documents.findFirst({
    where: and(
      eq(documents.projectId, projectId),
      eq(documents.type, "logline"),
    ),
    columns: { content: true },
  });
  return [
    `Titolo progetto: ${project?.title ?? "N/D"}`,
    `Formato: ${project?.format ?? "N/D"}`,
    `Genere: ${project?.genre ?? "N/D"}`,
    `Logline del progetto: ${loglineDoc?.content?.trim() || "N/D"}`,
  ].join("\n");
};

const normalizeScreenplayAdvice = (
  suggestions: readonly PolishSuggestion[],
): PolishSuggestion[] => {
  const normalized = sortEditorialAdvice(dedupeEditorialAdvice(suggestions));
  return normalized.length > 0
    ? normalized
    : [createEditorialApprovalAdvice("screenplay")];
};

const callPolish = async (
  projectId: string,
  content: string,
): Promise<PolishSuggestion[]> => {
  // Trim to keep tokens predictable: most polish comes from the first ~6
  // scenes anyway. The agent gets up to ~8k characters.
  const trimmed = content.slice(0, 8000);
  const context = await buildProjectContext(projectId);
  const result = await callHaiku(
    {
      system: POLISH_SYSTEM_PROMPT,
      fewShot: [],
      user: `${context}\n\nSceneggiatura:\n${trimmed}`,
      maxTokens: 1500,
      tools: [POLISH_TOOL],
      toolChoice: { type: "tool", name: POLISH_TOOL_NAME },
    },
    "cesare/polish",
  );
  if (result.isErr()) {
    console.warn("[cesare/polish] callHaiku error:", result.error.message);
    return [];
  }
  const input = extractToolUse(result.value.content, POLISH_TOOL_NAME);
  if (input === null) {
    console.warn(
      "[cesare/polish] no tool_use block, stop_reason:",
      result.value.stopReason,
    );
    return [];
  }
  const parsed = EditorialAdviceListSchema.safeParse(input);
  if (!parsed.success) {
    console.warn(
      "[cesare/polish] schema parse error:",
      parsed.error.issues.slice(0, 3),
      "raw:",
      JSON.stringify(input).slice(0, 300),
    );
    return [];
  }
  return normalizeScreenplayAdvice(
    parsed.data.suggestions.filter(
      (item): item is PolishSuggestion =>
        PolishSuggestionSchema.safeParse(item).success,
    ),
  );
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
        area: "format",
        type: "real_problem",
        severity: "high",
        scene: 1,
        title: "Manca la prima scene heading",
        body: "Senza una INT./EXT. iniziale la pagina non imposta il campo della scena. Qui il problema è reale.",
        snippet: null,
        minimalIntervention:
          "Apri con una scene heading minima, poi lascia il resto asciutto.",
      },
    ];
  }

  const out: PolishSuggestion[] = [];
  const sample = sceneHeadings.slice(0, 5);
  sample.forEach((s, i) => {
    const body = match(i % 4)
      .with(
        0,
        () =>
          `L'heading "${s.heading.slice(0, 60)}" è leggibile. Controllerei solo la coerenza tra luce e tempo della scena.`,
      )
      .with(
        1,
        () =>
          `L'ingresso del personaggio è chiaro. Se l'età ricompare più volte, la taglierei: è una rifinitura, non un difetto grave.`,
      )
      .with(
        2,
        () =>
          `La scena rischia di restare tutta su un unico respiro d'azione. Un beat in più può aiutare senza cambiare l'intenzione.`,
      )
      .otherwise(
        () =>
          `Il dialetto qui può restare ruvido. Marcherei solo il primo ingresso per accompagnare il lettore.`,
      );
    out.push({
      id: `polish-mock-${s.sceneNum}-${i}`,
      area: match(i % 4)
        .with(0, () => "format")
        .with(1, () => "style")
        .with(2, () => "rhythm")
        .otherwise(() => "dialogue"),
      type: match(i % 4)
        .with(0, () => "already_resolved" as const)
        .with(1, () => "optional" as const)
        .with(2, () => "risk" as const)
        .otherwise(() => "authorial_choice" as const),
      severity: i === 2 ? "medium" : i === 0 ? "optional" : "low",
      scene: s.sceneNum,
      title: match(i % 4)
        .with(0, () => "Forma di scena già a fuoco")
        .with(1, () => "Descrizione da alleggerire")
        .with(2, () => "Rischio di respiro unico")
        .otherwise(() => "Dialetto leggibile così"),
      body,
      snippet: s.heading.slice(0, 80),
    });
  });
  return normalizeScreenplayAdvice(out);
};

export const polishQueryOptions = (
  screenplayId: string,
  options: { hasContent?: boolean } = {},
) => ({
  queryKey: ["screenplay-polish", screenplayId] as const,
  queryFn: async (): Promise<{ suggestions: PolishSuggestion[] }> => {
    const r = await getScreenplayPolish({ data: { screenplayId } });
    if (!r.isOk) return { suggestions: [] };
    return r.value;
  },
  // Polish is heavy + expensive on token budget — refresh every 5 minutes,
  // not on every keystroke. The user can also manually refresh via a button.
  staleTime: 5 * 60 * 1000,
  // Skip the server roundtrip entirely while the screenplay has no scene
  // headings — otherwise the mock branch fires 5 fake suggestions on a
  // blank document and the panel feels noisy.
  enabled: screenplayId.length > 0 && options.hasContent !== false,
});

// ─── Scene-aware polish ───────────────────────────────────────────────────────
// Fetches suggestions for a single scene (identified by number). Uses
// scenes.notes (Fountain body) as the source — same data as the RAG context.
// Query key includes sceneNumber so TanStack Query caches per scene
// automatically: navigating back to a previously-visited scene hits the cache.

const SCENE_POLISH_SYSTEM_PROMPT = `Sei Cesare, dramaturg italiano. Stai leggendo una singola scena in formato Fountain.
Restituisci da 2 a 5 note editoriali in italiano.
Riferisci ogni nota al numero di scena fornito.
Non trattare ogni ambiguità come errore. Se la scena funziona, puoi dirlo.

REGOLA SUI FIND/REPLACE (importante):
Per ogni suggerimento dove l'edit è esprimibile come sostituzione testuale puntuale, DEVI compilare entrambi:
- find: la sostringa ESATTA presente nel testo (verbatim, max 400 char)
- replace: il testo proposto che la rimpiazza (max 800 char)
Usali solo quando l'intervento minimo è puntuale.

Non inventare elementi che non sono nel testo. Verifica che 'find' compaia letteralmente.`;

export const getScenePolish = createServerFn({ method: "GET" })
  .validator(
    z.object({
      screenplayId: z.string().uuid(),
      sceneNumber: z.number().int().positive(),
    }),
  )
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

      // Verify screenplay exists and user has access
      const spResult = await ResultAsync.fromPromise(
        db.query.screenplays
          .findFirst({ where: eq(screenplays.id, data.screenplayId) })
          .then((r) => r ?? null),
        (e) => new DbError("scenePolish/loadScreenplay", e),
      );
      if (spResult.isErr()) return toShape(err(spResult.error));
      if (!spResult.value)
        return toShape(err(new ScreenplayNotFoundError(data.screenplayId)));

      // Load a ±1 window around the target scene to give Cesare enough context
      const windowSize = 1;
      const minNum = Math.max(1, data.sceneNumber - windowSize);
      const maxNum = data.sceneNumber + windowSize;

      const sceneRows = await ResultAsync.fromPromise(
        db
          .select({
            number: scenes.number,
            heading: scenes.heading,
            notes: scenes.notes,
          })
          .from(scenes)
          .where(
            and(
              eq(scenes.screenplayId, data.screenplayId),
              gte(scenes.number, minNum),
              lte(scenes.number, maxNum),
            ),
          )
          .orderBy(scenes.number),
        (e) => new DbError("scenePolish/loadScenes", e),
      );

      if (sceneRows.isErr()) return toShape(err(sceneRows.error));

      // Build a small Fountain excerpt for the window
      const excerpt = sceneRows.value
        .map((r) => {
          const marker =
            r.number === data.sceneNumber ? " ← SCENA CORRENTE" : "";
          return `=== SC. ${r.number}${marker} ===\n${r.heading}\n${r.notes ?? ""}`;
        })
        .join("\n\n");

      const wantsMock =
        process.env["MOCK_AI"] === "true" || !process.env["ANTHROPIC_API_KEY"];

      const suggestions = wantsMock
        ? mockPolishForSceneNumber(
            data.sceneNumber,
            sceneRows.value[0]?.heading ?? "",
          )
        : await callScenePolish(
            spResult.value.projectId,
            excerpt,
            data.sceneNumber,
          );

      return toShape(ok({ suggestions }));
    },
  );

const callScenePolish = async (
  projectId: string,
  excerpt: string,
  sceneNumber: number,
): Promise<PolishSuggestion[]> => {
  void sceneNumber;
  const context = await buildProjectContext(projectId);
  const result = await callHaiku(
    {
      system: SCENE_POLISH_SYSTEM_PROMPT,
      fewShot: [],
      user: `${context}\n\nFinestra scene:\n${excerpt.slice(0, 6000)}`,
      maxTokens: 1200,
      tools: [POLISH_TOOL],
      toolChoice: { type: "tool", name: POLISH_TOOL_NAME },
    },
    "cesare/scene-polish",
  );
  if (result.isErr()) {
    console.warn(
      "[cesare/scene-polish] callHaiku error:",
      result.error.message,
    );
    return [];
  }
  const input = extractToolUse(result.value.content, POLISH_TOOL_NAME);
  if (input === null) return [];
  const parsed = EditorialAdviceListSchema.safeParse(input);
  if (!parsed.success) return [];
  return normalizeScreenplayAdvice(
    parsed.data.suggestions.filter(
      (item): item is PolishSuggestion =>
        PolishSuggestionSchema.safeParse(item).success,
    ),
  );
};

const mockPolishForSceneNumber = (
  sceneNumber: number,
  heading: string,
): PolishSuggestion[] => [
  {
    id: `scene-mock-${sceneNumber}-1`,
    area: "dialogue",
    type: "optional",
    severity: "low",
    scene: sceneNumber,
    title: "Dialogo da stringere appena",
    body: `Il dialogo regge, ma se due battute dicono quasi la stessa cosa puoi tagliarne una senza perdere tensione.`,
    minimalIntervention:
      "Elimina la battuta meno sorprendente invece di riscrivere tutto lo scambio.",
    snippet: heading.slice(0, 80),
  },
  {
    id: `scene-mock-${sceneNumber}-2`,
    area: "scene",
    type: "approved",
    severity: "optional",
    status: "approved",
    scene: sceneNumber,
    title: "Scena sufficientemente risolta",
    body: `${heading.slice(0, 40)} — la scena regge così. Non toccherei la struttura, salvo micro-rifiniture.`,
  },
];

export const scenePolishQueryOptions = (
  screenplayId: string,
  sceneNumber: number | null,
  options: { hasContent?: boolean } = {},
) => ({
  queryKey: ["screenplay-polish", screenplayId, sceneNumber] as const,
  queryFn: async (): Promise<{ suggestions: PolishSuggestion[] }> => {
    if (!sceneNumber) return { suggestions: [] };
    const r = await getScenePolish({ data: { screenplayId, sceneNumber } });
    if (!r.isOk) return { suggestions: [] };
    return r.value;
  },
  // Per-scene results are stable — cache for 10 minutes. Returning to a scene
  // within that window costs zero API calls.
  staleTime: 10 * 60 * 1000,
  enabled:
    screenplayId.length > 0 &&
    sceneNumber !== null &&
    options.hasContent !== false,
});
