// Repair Fountain where a character cue and its dialogue share ONE line
// ("FILIPPO Table four wants the marinara." → "FILIPPO\nTable four…").
//
// BUG #46: when Cesare GENERATES a screenplay from the narrative, the model is
// unreliable about Fountain element formatting — despite an explicit prompt, it
// often emits the cue and the speech on the same physical line. A cue is valid
// Fountain only when it is ALL-CAPS on its OWN line with the dialogue on the
// next; a line like "GIULIO And?" has lowercase, so `fountainToDoc` (correctly)
// classifies the whole line as ACTION and the dialogue collapses/disappears.
//
// The downstream canonicaliser (`docToFountain(fountainToDoc(raw))`) cannot fix
// this because by the time it parses, the line is already action. So we run this
// pre-pass on the RAW model output, BEFORE parsing: split any line that begins
// with a cue-shaped ALL-CAPS prefix immediately followed by lowercase speech
// into two lines (cue, then dialogue). Whitespace per line is trimmed too — the
// model also emits stray leading/trailing spaces.
//
// Conservative by construction: only a line whose prefix is genuinely cue-shaped
// AND whose remainder STARTS with a lowercase/“speech” character is split. A
// scene heading, a transition, or an all-caps action fragment is never touched.

// A cue prefix: 1-4 NAME words, ALL-CAPS, optionally trailing parentheticals
// like "(V.O.)" / "(CONT'D)". Captures the cue and the rest of the line. The
// remainder is the speech; we require it to CONTAIN a lowercase letter so we
// split only when real dialogue follows (a speech sentence has lowercase), never
// "INT. CUCINA" or a "FILIPPO MARCO" two-cue line (all-caps, no lowercase). The
// remainder may START uppercase ("Table four…", "And?", "Twelve…") — that's why
// the lowercase test is "contains", not "starts with".
const INLINE_CUE_RE =
  /^([A-ZÀ-Ý][A-ZÀ-Ý0-9'’#-]*(?:\s+[A-ZÀ-Ý0-9'’#-]+){0,3}(?:\s*\([^)]*\))*)\s+(\S.*)$/u;

const hasLowercase = (s: string): boolean => /\p{Ll}/u.test(s);

const SCENE_HEADING_RE = /^(INT|EST|EXT|INT\.?\/EXT|I\/E)[\.\/ ]/i;
const TRANSITION_RE = /(TO:|FADE (IN|OUT|TO)|DISSOLVENZA|STACCO|CUT)/i;

/**
 * Split inline "CUE dialogue" lines in raw Fountain into a cue line + a dialogue
 * line, and trim per-line whitespace. Idempotent: a cue already on its own line
 * (no lowercase remainder) is left untouched, so running it twice is a no-op.
 */
export const splitInlineCues = (raw: string): string => {
  const out: string[] = [];
  for (const rawLine of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) {
      out.push("");
      continue;
    }
    // Never touch scene headings or transitions — they are ALL-CAPS too.
    if (SCENE_HEADING_RE.test(line) || TRANSITION_RE.test(line)) {
      out.push(line);
      continue;
    }
    const m = INLINE_CUE_RE.exec(line);
    if (m && m[1] && m[2] && hasLowercase(m[2])) {
      out.push(m[1].trim());
      out.push(m[2].trim());
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
};
