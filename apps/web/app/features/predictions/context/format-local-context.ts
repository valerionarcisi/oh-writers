import type { LocalContext, SceneSummaryRow } from "@oh-writers/domain";

// Token budget per section (estimated at ~4 chars/token).
// Priority 1 (active entity) is never truncated.
// Priority 2 (list rows) is truncated from the tail when over cap.
const CAPS = {
  sceneList: 1200,
  sceneSummaries: 1500,
  sceneWindow: 800,
  budgetLines: 600,
  locationCandidates: 600,
  documents: 2000,
} as const;

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

// Truncates rows (string[]) until total text fits within maxTokens.
// Always keeps at least `minRows` rows (priority 1 entries).
const truncateRows = (
  rows: string[],
  maxTokens: number,
  minRows = 1,
): string[] => {
  let result = rows;
  while (
    result.length > minRows &&
    estimateTokens(result.join("\n")) > maxTokens
  ) {
    result = result.slice(0, -1);
  }
  return result;
};

// ─── Scene list ───────────────────────────────────────────────────────────────

const formatSceneList = (ctx: LocalContext): string | null => {
  if (ctx.scenes.length === 0) return null;

  const allRows = ctx.scenes.map((s) => `| ${s.number} | ${s.heading} |`);
  const header = `| SC | Heading |\n|----|---------|\n`;

  // Slice to hard limit of 200, then apply token cap within that slice.
  const sliced = allRows.slice(0, 200);
  const capped = truncateRows(sliced, CAPS.sceneList, 1);

  // Count omitted scenes: those beyond the 200 hard limit + those dropped by
  // token cap. Report as a single note to avoid conflicting counts in the prompt.
  const totalOmitted = ctx.scenes.length - capped.length;
  const omitNote =
    totalOmitted > 0
      ? `\n…e altre ${totalOmitted} scene (usa read_scene per il dettaglio)`
      : "";

  return `### Lista scene (${ctx.scenes.length})\n${header}${capped.join("\n")}${omitNote}`;
};

// ─── Scene summaries ──────────────────────────────────────────────────────────

const formatSummaryRow = (s: SceneSummaryRow): string => {
  const prod =
    s.productionNotes.length > 0 ? s.productionNotes.join(", ") : "—";
  const chars =
    s.presentCharacters.length > 0 ? s.presentCharacters.join(", ") : "—";
  return `| ${s.sceneNumber} | ${s.sceneHeading} | ${chars} | ${prod} |`;
};

const formatSceneSummaries = (summaries: SceneSummaryRow[]): string | null => {
  if (summaries.length === 0) return null;

  const header = `| SC | Heading | Personaggi | Note produzione |\n|----|---------|-----------|----------------|\n`;
  const rows = summaries.map(formatSummaryRow);
  const capped = truncateRows(rows, CAPS.sceneSummaries, 1);
  const omitted = rows.length - capped.length;
  const omitNote = omitted > 0 ? `\n…e altre ${omitted} scene` : "";

  return `### Scene summaries\n${header}${capped.join("\n")}${omitNote}`;
};

// ─── Active scene ─────────────────────────────────────────────────────────────

const formatActiveScene = (ctx: LocalContext): string | null => {
  if (!ctx.currentScene) return null;
  return `### Scena aperta\n**SC ${ctx.currentScene.number} — ${ctx.currentScene.heading}**`;
};

// ─── Scene window ─────────────────────────────────────────────────────────────

const formatSceneWindow = (ctx: LocalContext): string | null => {
  if (ctx.sceneWindow.length === 0) return null;

  const rows = ctx.sceneWindow.map((s) => {
    const label = s.isCurrent ? "→ APERTA" : "        ";
    const chars =
      s.characterNames.length > 0 ? ` [${s.characterNames.join(", ")}]` : "";
    const body =
      s.body !== null
        ? `\n  ${s.body.slice(0, 300)}${s.body.length > 300 ? "…" : ""}`
        : "";
    return `${label} SC.${s.number} ${s.heading}${chars}${body}`;
  });

  const capped = truncateRows(rows, CAPS.sceneWindow, 1);
  return `### Finestra scena (±window)\n${capped.join("\n\n")}`;
};

// ─── Characters ───────────────────────────────────────────────────────────────

const formatCharacters = (ctx: LocalContext): string | null => {
  if (ctx.characters.length === 0) return null;
  return `### Personaggi del progetto\n${ctx.characters.join(", ")}`;
};

// ─── Active document ─────────────────────────────────────────────────────────

const formatActiveDocument = (ctx: LocalContext): string | null => {
  if (!ctx.activeDocument) return null;
  const content = ctx.activeDocument.content.slice(0, CAPS.documents * 4);
  const truncated = ctx.activeDocument.content.length > CAPS.documents * 4;
  return (
    `### Documento attivo [${ctx.activeDocument.type.toUpperCase()}]\n` +
    content +
    (truncated ? "\n…(troncato)" : "")
  );
};

// ─── formatLocalContext ───────────────────────────────────────────────────────
// Serialises LocalContext into the dynamic (uncached) final system prompt block.
// Output is structured Markdown — tables where applicable, prose only for scene bodies.
// This text changes on every call — no cache_control is applied to it.

export const formatLocalContext = (ctx: LocalContext): string => {
  // Determine page label from available context signals
  const currentReq = ctx.currentRequirement as { name?: string } | null;
  const hasReq = currentReq !== null && typeof currentReq?.name === "string";
  const hasShooting = ctx.activeShootingDay !== null;
  const pageLabel = hasReq
    ? "Locations"
    : hasShooting
      ? "Schedule"
      : ctx.activeDocument
        ? ctx.activeDocument.type.charAt(0).toUpperCase() +
          ctx.activeDocument.type.slice(1)
        : "Sceneggiatura";

  const sections: string[] = [`## CONTESTO LOCALE — ${pageLabel}`];

  // Active entity (priority 1 — never omitted)
  const activeScene = formatActiveScene(ctx);
  if (activeScene) sections.push(activeScene);

  // Scene summaries (injected from DB, spec 38 output)
  const summariesBlock = formatSceneSummaries(ctx.sceneSummaries);
  if (summariesBlock) sections.push(summariesBlock);

  // Scene window (full body for nearby scenes)
  const windowBlock = formatSceneWindow(ctx);
  if (windowBlock) sections.push(windowBlock);

  // Scene list (metadata only)
  const sceneList = formatSceneList(ctx);
  if (sceneList) sections.push(sceneList);

  // Characters
  const chars = formatCharacters(ctx);
  if (chars) sections.push(chars);

  // Active document
  const doc = formatActiveDocument(ctx);
  if (doc) sections.push(doc);

  return sections.length > 1 ? sections.join("\n\n") : "(no local context)";
};
