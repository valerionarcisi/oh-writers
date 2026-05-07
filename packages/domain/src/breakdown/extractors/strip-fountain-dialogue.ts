/**
 * Strips dialogue lines from a Fountain scene body, leaving only action text
 * and character cue lines. Used by lemma extractors so they don't match words
 * spoken in dialogue (e.g. a character saying "gun" should not create a Props
 * element — only a gun appearing in action text should).
 *
 * Character cue lines are kept (they carry V.O./O.S. info needed by the sound
 * extractor). Only the spoken dialogue lines are removed.
 */

const CAPS_LINE = /^[A-Z0-9\s.\-'()/:]+$/;
const HAS_LETTER = /[A-Z]/;
const SLUGLINE_PREFIXES = /^(INT|EXT|EST|I\/E|INT\/EXT|INT\.\/EXT)\.?\b/;

export const stripFountainDialogue = (body: string): string => {
  const lines = body.split(/\r?\n/);
  const result: string[] = [];
  let inDialogue = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();

    if (raw.length === 0) {
      inDialogue = false;
      result.push(lines[i]!);
      continue;
    }

    const prev = i > 0 ? (lines[i - 1] ?? "").trim() : "";
    const isAfterBlank = i === 0 || prev.length === 0;

    if (
      isAfterBlank &&
      CAPS_LINE.test(raw) &&
      HAS_LETTER.test(raw) &&
      !SLUGLINE_PREFIXES.test(raw)
    ) {
      // Character cue line — keep it (V.O./O.S. info lives here) but
      // mark following lines as dialogue.
      result.push(lines[i]!);
      inDialogue = true;
      continue;
    }

    if (inDialogue) {
      // Dialogue text or parenthetical — skip.
      continue;
    }

    result.push(lines[i]!);
  }

  return result.join("\n");
};
