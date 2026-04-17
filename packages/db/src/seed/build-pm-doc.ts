/**
 * Minimal Fountain → ProseMirror JSON builder for the seed.
 *
 * Mirrors apps/web's `fountainToDoc` at the JSON-shape level, without
 * depending on prosemirror-model. It exists so seeded screenplays land in
 * the DB with scene headings already numbered (1, 2, 3…) + unlocked — so
 * the left-gutter scene-number button is visible on first load and clicking
 * opens the inline editor.
 */
// Inlined from @oh-writers/domain — we can't import across package rootDirs
// from tsc's perspective here, and the helper is a 4-line regex split.
const SPLIT_RE = /^(\S+[./])\s+(.+)$/;
const splitLegacyHeading = (raw: string): { prefix: string; title: string } => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { prefix: "", title: "" };
  const m = SPLIT_RE.exec(trimmed);
  if (m) return { prefix: m[1]!, title: m[2]! };
  return { prefix: "", title: trimmed };
};

const CHARACTER_INDENT = "      ";
const DIALOGUE_INDENT = "          ";
const SCENE_HEADING_RE =
  /^(?:INT\.?\/EXT\.|EXT\.?\/INT\.|INT\.?\/EST\.|EST\.?\/INT\.|INT\.|EXT\.|EST\.|I\/E)\s/;
const FOUNTAIN_TRANSITIONS = new Set([
  "FADE IN:",
  "FADE OUT:",
  "CUT TO:",
  "SMASH CUT TO:",
  "DISSOLVE TO:",
  "MATCH CUT TO:",
  "JUMP CUT TO:",
]);

type PmNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
};

type ElementType =
  | "scene"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition";

const isPlainCue = (line: string, trimmed: string): boolean => {
  if (trimmed.length === 0) return false;
  if (line !== line.trimStart()) return false;
  if (SCENE_HEADING_RE.test(trimmed)) return false;
  if (FOUNTAIN_TRANSITIONS.has(trimmed)) return false;
  if (trimmed !== trimmed.toUpperCase()) return false;
  if (!/[A-Z]/.test(trimmed)) return false;
  if (trimmed.length > 40) return false;
  const nameOnly = trimmed.replace(/\s*\([^)]*\)\s*$/, "");
  if (/[.!?,;:]/.test(nameOnly)) return false;
  return true;
};

const detectElement = (line: string): ElementType => {
  if (SCENE_HEADING_RE.test(line)) return "scene";
  const trimmed = line.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("(") && trimmed.endsWith(")"))
    return "parenthetical";
  if (line.startsWith(DIALOGUE_INDENT)) return "dialogue";
  if (line.startsWith(CHARACTER_INDENT)) return "character";
  if (isPlainCue(line, trimmed)) return "character";
  if (FOUNTAIN_TRANSITIONS.has(trimmed)) return "transition";
  return "action";
};

const stripIndent = (line: string, type: ElementType): string => {
  switch (type) {
    case "dialogue":
      return line.startsWith(DIALOGUE_INDENT)
        ? line.slice(DIALOGUE_INDENT.length)
        : line.trimStart();
    case "character":
      return line.startsWith(CHARACTER_INDENT)
        ? line.slice(CHARACTER_INDENT.length).trimEnd()
        : line.trim();
    case "parenthetical":
      return line.trimStart();
    case "scene":
      return line.trim();
    default:
      return line;
  }
};

const textChildren = (s: string): PmNode[] =>
  s.length > 0 ? [{ type: "text", text: s }] : [];

const buildHeading = (raw: string, sceneNumber: string): PmNode => {
  const { prefix, title } = splitLegacyHeading(raw);
  return {
    type: "heading",
    attrs: { scene_number: sceneNumber, scene_number_locked: false },
    content: [
      { type: "prefix", content: textChildren(prefix) },
      { type: "title", content: textChildren(title) },
    ],
  };
};

const buildBody = (type: ElementType, content: string): PmNode => {
  const text = textChildren(content);
  switch (type) {
    case "character":
      return { type: "character", content: text };
    case "parenthetical":
      return { type: "parenthetical", content: text };
    case "dialogue":
      return { type: "dialogue", content: text };
    case "transition":
      return { type: "transition", content: text };
    default:
      return { type: "action", content: text };
  }
};

export const buildPmDocFromFountain = (text: string): PmNode => {
  const lines = text.split("\n");
  const scenes: PmNode[] = [];
  let currentHeading: string | null = null;
  let currentBody: PmNode[] = [];
  let inDialogueBlock = false;

  const flush = () => {
    if (currentHeading === null) return;
    const n = String(scenes.length + 1);
    scenes.push({
      type: "scene",
      content: [buildHeading(currentHeading, n), ...currentBody],
    });
    currentHeading = null;
    currentBody = [];
  };

  const topLevel: PmNode[] = [];

  for (const rawLine of lines) {
    const line = rawLine;
    if (line.trim() === "") {
      inDialogueBlock = false;
      continue;
    }
    let type: ElementType = detectElement(line);
    if (inDialogueBlock && type === "action") {
      const trimmed = line.trim();
      type =
        trimmed.startsWith("(") && trimmed.endsWith(")")
          ? "parenthetical"
          : "dialogue";
    }
    if (type === "character" || type === "parenthetical")
      inDialogueBlock = true;
    else if (type !== "dialogue") inDialogueBlock = false;

    const content = stripIndent(line, type);

    if (type === "scene") {
      inDialogueBlock = false;
      flush();
      currentHeading = content;
      continue;
    }

    const node = buildBody(type, content);
    if (currentHeading !== null) currentBody.push(node);
    else topLevel.push(node);
  }

  flush();

  const allScenes =
    topLevel.length > 0
      ? [
          { type: "scene", content: [buildHeading("", ""), ...topLevel] },
          ...scenes,
        ]
      : scenes;

  if (allScenes.length === 0) {
    return {
      type: "doc",
      content: [{ type: "scene", content: [buildHeading("", "")] }],
    };
  }

  return { type: "doc", content: allScenes };
};
