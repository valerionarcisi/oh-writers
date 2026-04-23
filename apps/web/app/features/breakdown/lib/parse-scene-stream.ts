/**
 * Streaming JSON extractor for the Sonnet full-script breakdown stream.
 *
 * The model emits a tool_use input that incrementally fills the shape:
 *   { "scenes": [ { "sceneNumber": 1, "items": [...] }, ... ] }
 *
 * The Anthropic SDK surfaces this as a sequence of `input_json_delta`
 * events whose `partial_json` payloads concatenate into the JSON above.
 * We append them into a single growing `buffer` and call this function
 * after every delta to harvest any newly-completed scene object.
 *
 * The parser is deliberately small: it tracks the position inside the
 * outer `scenes` array and uses brace counting (string-aware) to find
 * the next complete `{...}` element. Each complete element is parsed
 * with `JSON.parse` and validated to have a numeric `sceneNumber`.
 *
 * Pure function: no I/O, no side effects. Easy to unit-test.
 */

export interface SceneItemRaw {
  name?: string;
  category?: string;
  quantity?: number;
  confidence?: number;
}

export interface ParsedSceneRaw {
  sceneNumber: number;
  items: SceneItemRaw[];
}

export interface ExtractResult {
  scenes: ParsedSceneRaw[];
  /** Position in `buffer` to resume from on the next call. */
  nextCursor: number;
}

const ARRAY_KEY_PATTERN = /"scenes"\s*:\s*\[/;

const findArrayStart = (buffer: string): number => {
  const match = ARRAY_KEY_PATTERN.exec(buffer);
  return match ? match.index + match[0].length : -1;
};

/**
 * Walks `buffer` starting at `from` and returns the index of the
 * matching closing brace for an object whose opening `{` is at `from`.
 * Returns -1 if the object is incomplete in the current buffer.
 *
 * String-aware: braces that appear inside `"..."` are ignored, and a
 * backslash escapes the next character (so `\"` does not close the
 * string).
 */
const findObjectEnd = (buffer: string, from: number): number => {
  if (buffer[from] !== "{") return -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = from; i < buffer.length; i += 1) {
    const ch = buffer[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
};

/**
 * Skips whitespace and a single optional comma starting at `from`.
 * Returns the new position. Used between scene objects.
 */
const skipSeparator = (buffer: string, from: number): number => {
  let i = from;
  while (i < buffer.length && /[\s,]/.test(buffer[i] ?? "")) i += 1;
  return i;
};

export const extractCompleteScenes = (
  buffer: string,
  cursor: number,
): ExtractResult => {
  const arrayStart = findArrayStart(buffer);
  if (arrayStart < 0) return { scenes: [], nextCursor: cursor };

  let position = Math.max(cursor, arrayStart);
  const scenes: ParsedSceneRaw[] = [];

  while (position < buffer.length) {
    position = skipSeparator(buffer, position);
    if (position >= buffer.length) break;
    if (buffer[position] === "]") {
      position += 1;
      break;
    }
    if (buffer[position] !== "{") {
      // Unexpected character; bail out and resume from here next call.
      break;
    }
    const end = findObjectEnd(buffer, position);
    if (end < 0) break;

    const slice = buffer.slice(position, end + 1);
    try {
      const parsed: unknown = JSON.parse(slice);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        typeof (parsed as { sceneNumber?: unknown }).sceneNumber === "number"
      ) {
        const sceneNumber = (parsed as { sceneNumber: number }).sceneNumber;
        const itemsValue = (parsed as { items?: unknown }).items;
        const items = Array.isArray(itemsValue)
          ? (itemsValue as SceneItemRaw[])
          : [];
        scenes.push({ sceneNumber, items });
      }
    } catch {
      // Malformed object — skip it but advance past it so the loop makes
      // progress and we don't get stuck re-parsing the same garbage.
    }
    position = end + 1;
  }

  return { scenes, nextCursor: position };
};
