/**
 * Generates packages/domain/src/dictionaries/data/en.json and it.json
 * from WordNet 3.1 (via `wordnet-db`) and MultiWordNet 1.39 (IT dump).
 *
 * Run: pnpm --filter @oh-writers/domain dict:build
 *
 * CI does NOT run this script. The generated JSON files are the source of
 * truth committed to git. Re-run only when upgrading the source data.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ─── WordNet EN ───────────────────────────────────────────────────────────────

// wordnet-db exposes the raw WordNet data files.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const wordnetDb = require("wordnet-db") as { path: string };
const dataDir: string = wordnetDb.path;

/** Parse a WordNet data file (data.noun, data.verb, …) into a map from
 *  synset offset (8-digit zero-padded) to { pointers, lemmas }. */
function parseDataFile(
  filePath: string,
): Map<string, { ptrs: string[]; lemmas: string[] }> {
  const map = new Map<string, { ptrs: string[]; lemmas: string[] }>();
  const lines = readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    if (line.startsWith("  ")) continue; // header
    const parts = line.trim().split(" ");
    if (parts.length < 5) continue;
    const offset = parts[0]!;
    // word count is at index 3 (hex)
    const wordCountHex = parts[3]!;
    const wordCount = parseInt(wordCountHex, 16);
    const lemmas: string[] = [];
    for (let i = 0; i < wordCount; i++) {
      const word = parts[4 + i * 2];
      if (word) lemmas.push(word.toLowerCase().replace(/_/g, " "));
    }
    // pointer section starts after words
    const ptrStart = 4 + wordCount * 2;
    const ptrCount = parseInt(parts[ptrStart] ?? "0", 10);
    const ptrs: string[] = [];
    for (let i = 0; i < ptrCount; i++) {
      const ptrOffset = parts[ptrStart + 1 + i * 4 + 1];
      if (ptrOffset) ptrs.push(ptrOffset);
    }
    map.set(offset, { ptrs, lemmas });
  }
  return map;
}

function collectDescendants(
  startOffset: string,
  data: Map<string, { ptrs: string[]; lemmas: string[] }>,
): Set<string> {
  const lemmas = new Set<string>();
  const visited = new Set<string>();
  const queue = [startOffset];
  while (queue.length > 0) {
    const offset = queue.shift()!;
    if (visited.has(offset)) continue;
    visited.add(offset);
    const node = data.get(offset);
    if (!node) continue;
    for (const l of node.lemmas) lemmas.add(l);
    for (const ptr of node.ptrs) queue.push(ptr);
  }
  return lemmas;
}

// artifact.n.01 offset in WordNet 3.1
const ARTIFACT_OFFSET = "00021939";

console.log("Parsing WordNet noun data…");
const nounData = parseDataFile(join(dataDir, "data.noun"));
const enLemmas = collectDescendants(ARTIFACT_OFFSET, nounData);
console.log(`EN: ${enLemmas.size} lemmas`);

writeFileSync(
  join(__dirname, "../src/dictionaries/data/en.json"),
  JSON.stringify(
    { version: "wordnet-3.1", words: [...enLemmas].sort() },
    null,
    2,
  ),
);

// ─── MultiWordNet IT ──────────────────────────────────────────────────────────

const tsvPath = join(__dirname, "raw/multiwordnet-it.tsv");
if (!existsSync(tsvPath)) {
  console.error("MultiWordNet IT dump not found at", tsvPath);
  console.error(
    "Download it from http://multiwordnet.fbk.eu and save as multiwordnet-it.tsv",
  );
  process.exit(1);
}

const itLemmas = new Set<string>();
const tsvLines = readFileSync(tsvPath, "utf-8").split("\n");
for (const line of tsvLines) {
  const [rawOffset, lemma] = line.split("\t");
  if (!rawOffset || !lemma) continue;
  // TSV offsets are 8-digit, same space as WordNet
  const offset = rawOffset.padStart(8, "0");
  if (enLemmas.size > 0 && !nounData.has(offset)) continue; // not in artifact set
  // Only keep if the synset is a descendant of artifact.n.01
  if (
    !collectDescendants(ARTIFACT_OFFSET, nounData).has(
      [...(nounData.get(offset)?.lemmas ?? [])][0] ?? "",
    )
  ) {
    // Check offset directly
    if (!nounData.has(offset)) continue;
  }
  const normalized = lemma.trim().toLowerCase().normalize("NFC");
  if (normalized.length >= 2) itLemmas.add(normalized);
}
console.log(`IT: ${itLemmas.size} lemmas`);

writeFileSync(
  join(__dirname, "../src/dictionaries/data/it.json"),
  JSON.stringify(
    { version: "multiwordnet-1.39", words: [...itLemmas].sort() },
    null,
    2,
  ),
);

console.log("Done.");
