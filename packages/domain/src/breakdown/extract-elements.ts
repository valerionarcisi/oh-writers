import { ResultAsync, errAsync, ok } from "neverthrow";
import type { Locale } from "../constants.js";
import {
  loadDictionary,
  DictionaryLoadError,
  UnsupportedLocaleError,
} from "../dictionaries/index.js";

export interface ExtractedElement {
  readonly word: string;
  readonly normalized: string;
  readonly charOffset: number;
}

const normalize = (s: string): string => s.toLowerCase().normalize("NFC");

const tokenizeEn = async (
  text: string,
): Promise<Array<{ word: string; normalized: string; charOffset: number }>> => {
  const { default: nlp } = await import("compromise");
  const doc = nlp(text);
  const results: Array<{
    word: string;
    normalized: string;
    charOffset: number;
  }> = [];

  // Iterate over noun phrases / individual nouns
  doc.nouns().forEach((noun) => {
    const terms = noun.json({ offset: true }) as Array<{
      text: string;
      offset: { start: number; length: number };
      terms: Array<{ text: string; normal: string }>;
    }>;
    for (const t of terms) {
      // Use individual terms (single tokens) to match against the whitelist
      for (const term of t.terms) {
        const normalized = normalize(term.text);
        if (normalized.length < 2) continue;
        results.push({
          word: term.text,
          normalized,
          charOffset: t.offset.start,
        });
      }
    }
  });

  return results;
};

const tokenizeIt = (
  text: string,
): Array<{ word: string; normalized: string; charOffset: number }> => {
  // No maintained Italian POS tagger — emit all tokens and rely on the
  // whitelist to filter out non-artifact words.
  const results: Array<{
    word: string;
    normalized: string;
    charOffset: number;
  }> = [];
  const tokenRe = /[^\s,.!?;:()\[\]{}"']+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(text)) !== null) {
    const word = match[0];
    const normalized = normalize(word);
    if (normalized.length < 2) continue;
    results.push({ word, normalized, charOffset: match.index });
  }
  return results;
};

export const extractElements = ({
  sceneText,
  locale,
}: {
  sceneText: string;
  locale: Locale;
}): ResultAsync<
  ExtractedElement[],
  UnsupportedLocaleError | DictionaryLoadError
> => {
  const dictResult = loadDictionary(locale);
  if (dictResult.isErr()) return errAsync(dictResult.error);

  const dict = dictResult.value;

  const tokenize = (): Promise<
    Array<{ word: string; normalized: string; charOffset: number }>
  > => {
    if (locale === "en") return tokenizeEn(sceneText);
    return Promise.resolve(tokenizeIt(sceneText));
  };

  return ResultAsync.fromSafePromise(
    tokenize().then((tokens) => {
      const seen = new Set<string>();
      const elements: ExtractedElement[] = [];
      for (const token of tokens) {
        if (!dict.has(token.normalized)) continue;
        if (seen.has(token.normalized)) continue;
        seen.add(token.normalized);
        elements.push({
          word: token.word,
          normalized: token.normalized,
          charOffset: token.charOffset,
        });
      }
      return elements;
    }),
  ).andThen((elements) => ok(elements));
};
