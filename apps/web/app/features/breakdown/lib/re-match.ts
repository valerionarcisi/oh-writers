const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isWordChar = (ch: string): boolean => /\w/.test(ch);

export const findElementInText = (
  elementName: string,
  sceneText: string,
): boolean => {
  const trimmed = elementName.trim();
  if (trimmed.length === 0) return false;
  const escaped = escapeRegex(trimmed);
  const firstChar = trimmed.charAt(0);
  const lastChar = trimmed.charAt(trimmed.length - 1);
  const leftBoundary = isWordChar(firstChar) ? "\\b" : "(?:^|\\W)";
  const rightBoundary = isWordChar(lastChar) ? "\\b" : "(?:\\W|$)";
  const re = new RegExp(`${leftBoundary}${escaped}${rightBoundary}`, "i");
  return re.test(sceneText);
};
