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
// Lazy extra-word repetition ({0,3}?): grab the MINIMAL cue, so a colliding
// "FILIPPO I have to …" yields cue "FILIPPO" + remainder "I have to …" rather
// than greedily swallowing the speech's leading capital ("FILIPPO I"). Multi-
// word cues ("THE NONNO") are recovered downstream by splitEmbeddedCues.
const INLINE_CUE_RE =
  /^([A-ZÀ-Ý][A-ZÀ-Ý0-9'’#-]*(?:\s+[A-ZÀ-Ý0-9'’#-]+){0,3}?(?:\s*\([^)]*\))*)\s+(\S.*)$/u;

// BUG #51 — the model also collides TWO cues on one physical line:
//   "FILIPPO Giulio — GIULIO Go."  /  "FILIPPO I have to — THE NONNO Go. Work."
// After the leading cue is split off, the remainder ("Giulio — GIULIO Go.")
// still hides a second cue. This matches an embedded cue boundary inside a
// remainder: any separator (em/en dash, hyphen, or run of spaces) followed by a
// genuinely cue-shaped ALL-CAPS token and lowercase-bearing speech. We split
// there and recurse. Conservative: the token must be ALL-CAPS (1-4 words, opt.
// parenthetical) and the speech after it must contain a lowercase letter, so an
// ordinary "Giulio — go" (Title-case) or "ROMA — NAPOLI" (no lowercase) is
// never touched.
const EMBEDDED_CUE_RE =
  /^(.*?\S)\s*(?:[—–-]|\s{2,})\s*([A-ZÀ-Ý][A-ZÀ-Ý0-9'’#-]*(?:\s+[A-ZÀ-Ý0-9'’#-]+){0,3}(?:\s*\([^)]*\))*)\s+(\p{L}.*)$/u;

const hasLowercase = (s: string): boolean => /\p{Ll}/u.test(s);

const SCENE_HEADING_RE = /^(INT|EST|EXT|INT\.?\/EXT|I\/E)[\.\/ ]/i;
const TRANSITION_RE = /(TO:|FADE (IN|OUT|TO)|DISSOLVENZA|STACCO|CUT)/i;

interface FountainPart {
  readonly text: string;
  readonly isCue: boolean;
}

// Split a remainder that hides one or more further cues into alternating
// dialogue / cue / dialogue parts. "Giulio — GIULIO Go." → [Giulio(dlg),
// GIULIO(cue), Go.(dlg)]. A remainder with no embedded cue returns as a single
// dialogue part. The cue token is required to be ALL-CAPS and the trailing
// speech to contain a lowercase letter, matching the leading-cue contract.
const splitEmbeddedCues = (remainder: string): FountainPart[] => {
  const m = EMBEDDED_CUE_RE.exec(remainder);
  if (m && m[1] && m[2] && m[3] && !hasLowercase(m[2]) && hasLowercase(m[3])) {
    return [
      { text: m[1].trim(), isCue: false },
      { text: m[2].trim(), isCue: true },
      ...splitEmbeddedCues(m[3].trim()),
    ];
  }
  return [{ text: remainder.trim(), isCue: false }];
};

// A character cue is valid Fountain only when a BLANK LINE precedes it. The
// model often emits consecutive "CUE speech" lines with no separators
// ("FILIPPO …\nGIULIO …"); after splitting each onto its own line we must also
// insert the blank line before every cue, or the parser folds the next cue into
// the previous dialogue block. Pushes a "" first unless the output is empty or
// already ends in a blank line (keeps the pass idempotent).
const pushCue = (out: string[], cue: string): void => {
  if (out.length > 0 && out[out.length - 1] !== "") out.push("");
  out.push(cue);
};

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
      // A cue needs a preceding blank line to parse as a cue, not a dialogue
      // continuation of the line above.
      pushCue(out, m[1].trim());
      // The remainder may itself collide further cues ("Giulio — GIULIO Go.").
      for (const part of splitEmbeddedCues(m[2].trim())) {
        if (part.isCue) pushCue(out, part.text);
        else out.push(part.text);
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
};
