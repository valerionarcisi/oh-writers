import type { Node as PMNode } from "prosemirror-model";
import type { BreakdownCategory } from "@oh-writers/domain";

export interface ElementForMatch {
  id: string;
  name: string;
  category: BreakdownCategory;
  isStale: boolean;
}

export interface OccurrenceRange {
  from: number;
  to: number;
  elementId: string;
  category: BreakdownCategory;
  isStale: boolean;
}

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Finds all occurrences of each element name in the doc's text content.
 * Case-insensitive, word-boundary-aware (so "Bob" does NOT match "Bobby").
 *
 * Iterates each text node and runs a regex per element; for each match we
 * compute the absolute doc position by adding the text node's start pos
 * to the local match index.
 */
export function findOccurrencesInDoc(
  doc: PMNode,
  elements: ElementForMatch[],
): OccurrenceRange[] {
  if (elements.length === 0) return [];
  const ranges: OccurrenceRange[] = [];
  const patterns = elements.map((el) => ({
    el,
    re: new RegExp(`\\b${escapeRegex(el.name)}\\b`, "giu"),
  }));

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    const text = node.text;
    for (const { el, re } of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const from = pos + m.index;
        const to = from + m[0].length;
        ranges.push({
          from,
          to,
          elementId: el.id,
          category: el.category,
          isStale: el.isStale,
        });
      }
    }
    return false;
  });

  return ranges;
}
