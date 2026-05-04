export const CARTELLA_CHARS = 1800;

export const toCartelle = (charCount: number): number =>
  charCount <= 0 ? 0 : Math.max(1, Math.ceil(charCount / CARTELLA_CHARS));
