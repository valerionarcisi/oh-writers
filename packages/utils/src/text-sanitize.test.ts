import { describe, it, expect } from "vitest";
import {
  repairMojibake,
  reflowFountainParagraphs,
  sanitizeAiText,
  toPlainText,
} from "./text-sanitize";

// Mimic the production decoder bug: take UTF-8 bytes of the input string,
// then reinterpret them as Latin-1 (each byte → its codepoint). Round-tripping
// any string with non-ASCII chars through this function produces the same
// mojibake we observed in the DB.
const corrupt = (input: string): string => {
  const bytes = Buffer.from(input, "utf8");
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
};

describe("repairMojibake", () => {
  it("returns input untouched when no mojibake markers present", () => {
    expect(repairMojibake("ciao mondo")).toBe("ciao mondo");
    expect(repairMojibake("perché è così — non lo so")).toBe(
      "perché è così — non lo so",
    );
    expect(repairMojibake("")).toBe("");
  });

  it("repairs every Italian-keyboard direct accented vowel (à è é ì ò ù)", () => {
    const chars = ["à", "è", "é", "ì", "ò", "ù", "À", "È", "É", "Ì", "Ò", "Ù"];
    for (const ch of chars) {
      expect(repairMojibake(corrupt(ch))).toBe(ch);
      expect(repairMojibake(`prima${corrupt(ch)}dopo`)).toBe(`prima${ch}dopo`);
    }
  });

  it("repairs Italian-keyboard Shift symbols (° ç Ç §)", () => {
    for (const ch of ["°", "ç", "Ç", "§"]) {
      expect(repairMojibake(corrupt(ch))).toBe(ch);
    }
  });

  it("repairs Italian-keyboard AltGr currency (€ £)", () => {
    expect(repairMojibake(corrupt("€"))).toBe("€");
    expect(repairMojibake(corrupt("£"))).toBe("£");
    expect(repairMojibake(corrupt("Costa 30€ più IVA"))).toBe(
      "Costa 30€ più IVA",
    );
  });

  it("repairs less common Italian / loanword chars", () => {
    const chars = ["á", "â", "ê", "í", "î", "ó", "ô", "ú", "û", "ñ"];
    for (const ch of chars) expect(repairMojibake(corrupt(ch))).toBe(ch);
  });

  it("repairs typographic punctuation", () => {
    const chars = [
      "—",
      "–",
      "…",
      "•",
      "“",
      "”",
      "‘",
      "’",
      "«",
      "»",
      "¡",
      "¿",
      "´",
    ];
    for (const ch of chars) {
      expect(repairMojibake(corrupt(ch))).toBe(ch);
    }
  });

  it("repairs trademark and currency symbols", () => {
    for (const ch of [
      "©",
      "®",
      "™",
      "¢",
      "¥",
      "µ",
      "±",
      "×",
      "÷",
      "¼",
      "½",
      "¾",
    ]) {
      expect(repairMojibake(corrupt(ch))).toBe(ch);
    }
  });

  it("is idempotent on already-clean text", () => {
    const clean = "Il signor Rossi è andato a Milano perché aveva fretta.";
    expect(repairMojibake(repairMojibake(clean))).toBe(clean);
  });

  it("repairs a realistic mixed Cesare output line", () => {
    const clean =
      "Soffitto basso. Luci gialle, un po' fiacche — quelle che c'erano già. Il microfono è storto.";
    expect(repairMojibake(corrupt(clean))).toBe(clean);
  });

  it("repairs an entire scene block", () => {
    const clean =
      "INT. RADICE, SALA - NOTTE\n\nSoffitto basso. È quasi mezzanotte. Filippo guarda dalla finestra.\n\n                    MARCO\n          Però, che città straordinaria.";
    expect(repairMojibake(corrupt(clean))).toBe(clean);
  });
});

describe("reflowFountainParagraphs", () => {
  it("joins single line breaks inside an action paragraph", () => {
    const input =
      "Soffitto basso. Luci gialle, un po' fiacche — quelle che\nc'erano già. Il microfono è storto su un'asta telescopica\nche non si blocca bene.";
    const expected =
      "Soffitto basso. Luci gialle, un po' fiacche — quelle che c'erano già. Il microfono è storto su un'asta telescopica che non si blocca bene.";
    expect(reflowFountainParagraphs(input)).toBe(expected);
  });

  it("preserves blank lines between paragraphs", () => {
    const input =
      "Prima azione molto\nlunga su due righe.\n\nSeconda azione su\ntre righe diverse, ok?";
    const expected =
      "Prima azione molto lunga su due righe.\n\nSeconda azione su tre righe diverse, ok?";
    expect(reflowFountainParagraphs(input)).toBe(expected);
  });

  it("preserves scene headings as their own block", () => {
    const input =
      "INT. CUCINA - NOTTE\n\nMaria è seduta.\nMangia una mela\nrosso fuoco.";
    const expected =
      "INT. CUCINA - NOTTE\n\nMaria è seduta. Mangia una mela rosso fuoco.";
    expect(reflowFountainParagraphs(input)).toBe(expected);
  });

  it("preserves indented character cues, parentheticals, and dialogue", () => {
    const input = [
      "INT. SALA - GIORNO",
      "",
      "Marco entra.",
      "",
      "                    MARCO",
      "          (sottovoce)",
      "    Allora, com'è andata?",
      "    Vuoi davvero saperlo?",
      "",
      "Pausa.",
    ].join("\n");
    expect(reflowFountainParagraphs(input)).toBe(input);
  });

  it("collapses 3+ blank lines to a single blank line", () => {
    const input = "Prima.\n\n\n\n\nSeconda.";
    expect(reflowFountainParagraphs(input)).toBe("Prima.\n\nSeconda.");
  });

  it("normalizes CRLF and CR to LF before reflowing", () => {
    const input = "Una\r\nfrase.\r\n\r\nAltra\rfrase.";
    expect(reflowFountainParagraphs(input)).toBe("Una frase.\n\nAltra frase.");
  });

  it("preserves transitions like CUT TO:", () => {
    const input = "Marco entra.\nPoi esce.\n\nCUT TO:\n\nINT. STRADA - NOTTE";
    const expected = "Marco entra. Poi esce.\n\nCUT TO:\n\nINT. STRADA - NOTTE";
    expect(reflowFountainParagraphs(input)).toBe(expected);
  });

  it("is idempotent on already-clean Fountain", () => {
    const clean =
      "INT. CASA - NOTTE\n\nMaria è seduta in cucina. Beve una tisana.\n\nFuori, il vento batte sulla finestra.";
    expect(reflowFountainParagraphs(reflowFountainParagraphs(clean))).toBe(
      clean,
    );
  });

  it("merges adjacent action paragraphs when first lacks closing punctuation", () => {
    // This is the Cesare soft-wrap pattern: each ~55-char chunk becomes its
    // own paragraph (\n\n). The first chunk ends mid-sentence ("cemento")
    // so it should merge with the next, which DOES close ("RADICE").
    const input =
      "Una villetta liberty stretta tra due palazzi di cemento\n\nanni Sessanta. Freddo di novembre. L'insegna del RADICE\n\nè al neon — metà lettere spente, le altre arancioni,\n\nsufficienti.";
    const expected =
      "Una villetta liberty stretta tra due palazzi di cemento anni Sessanta. Freddo di novembre. L'insegna del RADICE è al neon — metà lettere spente, le altre arancioni, sufficienti.";
    expect(reflowFountainParagraphs(input)).toBe(expected);
  });

  it("does NOT merge paragraphs that close with strong punctuation", () => {
    const input = "Maria entra.\n\nFuori piove forte.\n\nIl cane abbaia.";
    expect(reflowFountainParagraphs(input)).toBe(input);
  });

  it("merges across multiple chunks but stops at strong punctuation", () => {
    const input =
      "Marco cammina lungo il corridoio\n\nbuio e silenzioso, le pareti\n\nscrostate dall'umidità.\n\nPoi entra in una stanza.";
    const expected =
      "Marco cammina lungo il corridoio buio e silenzioso, le pareti scrostate dall'umidità.\n\nPoi entra in una stanza.";
    expect(reflowFountainParagraphs(input)).toBe(expected);
  });

  it("does NOT merge action into a character cue or vice versa", () => {
    const input = [
      "Marco entra senza salutare",
      "",
      "                    MARIO",
      "          Ciao, finalmente.",
      "",
      "Marco si siede",
      "",
      "lentamente sulla sedia.",
    ].join("\n");
    const expected = [
      "Marco entra senza salutare",
      "",
      "                    MARIO",
      "          Ciao, finalmente.",
      "",
      "Marco si siede lentamente sulla sedia.",
    ].join("\n");
    expect(reflowFountainParagraphs(input)).toBe(expected);
  });
});

describe("sanitizeAiText", () => {
  it("repairs mojibake AND reflows paragraphs in one pass", () => {
    const cleanExpected =
      "INT. RADICE, SALA - NOTTE\n\nSoffitto basso. Luci gialle, un po' fiacche — quelle che c'erano già. Il microfono è storto.";
    // Corrupt the multi-line version (with mid-paragraph soft breaks).
    const brokenMultiLine = corrupt(
      "INT. RADICE, SALA - NOTTE\n\nSoffitto basso. Luci gialle, un po' fiacche — quelle che\nc'erano già. Il microfono è storto.",
    );
    expect(sanitizeAiText(brokenMultiLine)).toBe(cleanExpected);
  });

  it("is a no-op on clean, well-formed Fountain", () => {
    const clean =
      "INT. BAR - GIORNO\n\nLuca entra. Si siede al bancone.\n\n                    LUCA\n          Un caffè, grazie.";
    expect(sanitizeAiText(clean)).toBe(clean);
  });

  it("is idempotent", () => {
    const input = corrupt(
      "Prima frase con perché e così.\n\nSeconda frase\nspezzata.",
    );
    const once = sanitizeAiText(input);
    const twice = sanitizeAiText(once);
    expect(twice).toBe(once);
  });
});

describe("toPlainText", () => {
  it("returns empty string for empty input", () => {
    expect(toPlainText("")).toBe("");
    expect(toPlainText("   ")).toBe("");
  });

  it("leaves plain prose untouched (modulo whitespace)", () => {
    expect(toPlainText("Marco telefona a Luca. Sono le tre.")).toBe(
      "Marco telefona a Luca. Sono le tre.",
    );
  });

  it("strips ProseMirror HTML tags and decodes entities", () => {
    const html =
      "<p>Marco telefona Luca, sono le<br>tre del mattino.</p><p>Luca &amp; Anna dormono.</p>";
    expect(toPlainText(html)).toBe(
      "Marco telefona Luca, sono le tre del mattino. Luca & Anna dormono.",
    );
  });

  it("strips a fenced fountain block with a title page and shows the first prose", () => {
    const raw = [
      "```fountain",
      'Title: "Non lo so."',
      "Credit: Written by",
      "Author: Cesare",
      "Draft date: 2024",
      "Contact: —",
      "====",
      "",
      "INT. CUCINA - NOTTE",
      "",
      "Marco entra in cucina e accende la luce.",
      "```",
    ].join("\n");
    expect(toPlainText(raw)).toBe(
      "INT. CUCINA - NOTTE Marco entra in cucina e accende la luce.",
    );
  });

  it("skips a bare fountain title page (no fence)", () => {
    const raw = [
      "Title: Il Soggetto",
      "Author: Cesare",
      "===",
      "",
      "La storia comincia in un bar di periferia.",
    ].join("\n");
    expect(toPlainText(raw)).toBe("La storia comincia in un bar di periferia.");
  });

  it("strips markdown headings, bullets, and inline emphasis", () => {
    const raw = [
      "## Atto primo",
      "",
      "- Un **uomo** entra in scena.",
      "- Parla *piano* con `nessuno`.",
    ].join("\n");
    expect(toPlainText(raw)).toBe(
      "Atto primo Un uomo entra in scena. Parla piano con nessuno.",
    );
  });

  it("does not treat a colon mid-sentence as a title-page key", () => {
    const raw = "Lei dice: smettila di mentire.";
    expect(toPlainText(raw)).toBe("Lei dice: smettila di mentire.");
  });

  it("keeps prose that merely contains an = sign", () => {
    const raw = "Il bilancio = entrate meno uscite, sempre.";
    expect(toPlainText(raw)).toBe("Il bilancio = entrate meno uscite, sempre.");
  });
});
