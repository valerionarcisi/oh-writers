const CHARACTER_INDENT = "      "; // 6 spaces — matches editor convention
const DIALOGUE_INDENT = "          "; // 10 spaces

type ElementType =
  | "scene"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "action";

interface RawLine {
  text: string;
  index: number;
}

const isSceneHeading = (text: string): boolean =>
  /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E)\s/i.test(text.trim());

const isTransition = (text: string): boolean =>
  /^[A-Z ]+(?:TO:|IN\.|OUT\.)\s*$/.test(text.trim());

const isCharacterCue = (text: string, prevBlank: boolean): boolean => {
  const t = text.trim();
  // Must follow a blank line, be ALL CAPS, non-empty, no trailing sentence punctuation
  return (
    prevBlank &&
    t.length > 0 &&
    t === t.toUpperCase() &&
    /[A-Z]/.test(t) &&
    !isSceneHeading(text) &&
    !isTransition(text) &&
    !/[.!?,]$/.test(t.replace(/\s*\(.*\)\s*$/, "")) // allow (V.O.) extension
  );
};

const isParenthetical = (text: string): boolean => /^\s*\(.*\)\s*$/.test(text);

/**
 * Converts raw PDF extracted text to Fountain format using the Oh Writers
 * indent conventions: 6-space CHARACTER cues, 10-space dialogue + parentheticals.
 *
 * Heuristics work well for PDFs from Final Draft, Fade In, Highland, and
 * any tool that outputs standard screenplay PDF formatting.
 */
export const fountainFromPdf = (rawText: string): string => {
  const rawLines: RawLine[] = rawText
    .split("\n")
    .map((text, index) => ({ text, index }));

  const classified: Array<{ type: ElementType; text: string }> = [];
  let prevBlank = true;
  let inDialogueBlock = false;

  for (const { text } of rawLines) {
    const trimmed = text.trim();

    if (trimmed === "") {
      classified.push({ type: "action", text: "" });
      prevBlank = true;
      inDialogueBlock = false;
      continue;
    }

    if (isSceneHeading(text)) {
      classified.push({ type: "scene", text: trimmed.toUpperCase() });
      prevBlank = false;
      inDialogueBlock = false;
      continue;
    }

    if (isTransition(text)) {
      classified.push({ type: "transition", text: trimmed.toUpperCase() });
      prevBlank = false;
      inDialogueBlock = false;
      continue;
    }

    if (isParenthetical(text) && inDialogueBlock) {
      classified.push({ type: "parenthetical", text: trimmed });
      prevBlank = false;
      continue;
    }

    if (isCharacterCue(text, prevBlank)) {
      classified.push({ type: "character", text: trimmed });
      prevBlank = false;
      inDialogueBlock = true;
      continue;
    }

    if (inDialogueBlock) {
      classified.push({ type: "dialogue", text: trimmed });
      prevBlank = false;
      continue;
    }

    classified.push({ type: "action", text: trimmed });
    prevBlank = false;
  }

  // Render to Oh Writers Fountain format
  return classified
    .map(({ type, text }) => {
      switch (type) {
        case "scene":
          return text;
        case "character":
          return CHARACTER_INDENT + text;
        case "parenthetical":
          return DIALOGUE_INDENT + text;
        case "dialogue":
          return DIALOGUE_INDENT + text;
        case "transition":
          return text;
        case "action":
          return text;
      }
    })
    .join("\n")
    .trim();
};
