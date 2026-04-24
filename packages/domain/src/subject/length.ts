export const CHARS_PER_CARTELLA = 1800;
export const WORDS_PER_PAGE = 250;
export const SOGGETTO_SOFT_WARNING_WORDS = 3600;

export interface SubjectLength {
  readonly cartelle: number;
  readonly pages: number;
  readonly words: number;
  readonly chars: number;
  readonly isOverSoftLimit: boolean;
}

const roundToOneDecimal = (n: number): number => Math.round(n * 10) / 10;

const countWords = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
};

export const analyzeSubjectLength = (text: string): SubjectLength => {
  const chars = text.length;
  const words = countWords(text);
  const cartelle = roundToOneDecimal(chars / CHARS_PER_CARTELLA);
  const pages = roundToOneDecimal(words / WORDS_PER_PAGE);
  const isOverSoftLimit = words > SOGGETTO_SOFT_WARNING_WORDS;
  return { cartelle, pages, words, chars, isOverSoftLimit };
};
