import type { FilmBible } from "../bible/schema.js";

/**
 * Full bible formatted for the [FILM BIBLE] cached system prompt block.
 * Injected right after ROLE_TEXT so it's always warm in the Anthropic cache.
 */
export const formatGlobalContext = (bible: FilmBible): string => {
  const lines: string[] = ["[FILM BIBLE]"];

  lines.push(`\nSETTING: ${bible.settingSummary}`);
  lines.push(`GENERE E TONO: ${bible.genreAndTone}`);
  lines.push(`CONFLITTO CENTRALE: ${bible.centralConflict}`);

  if (bible.productionConstraints.length > 0) {
    lines.push(`\nVINCOLI DI PRODUZIONE:`);
    for (const c of bible.productionConstraints) {
      lines.push(`  - ${c}`);
    }
  }

  if (bible.recurringLocations.length > 0) {
    lines.push(`\nLOCATION RICORRENTI:`);
    for (const loc of bible.recurringLocations) {
      const aliases =
        loc.aliases.length > 0 ? ` (aka: ${loc.aliases.join(", ")})` : "";
      lines.push(
        `  - ${loc.canonicalName}${aliases} [${loc.locationType}] — ${loc.settingPrior} (${loc.sceneCount} scene)`,
      );
    }
  }

  if (bible.keyCharacters.length > 0) {
    lines.push(`\nPERSONAGGI CHIAVE:`);
    for (const char of bible.keyCharacters) {
      const arc = char.arc ? ` — arco: ${char.arc}` : "";
      lines.push(`  - ${char.name} (${char.role})${arc}`);
    }
  }

  return lines.join("\n");
};

/**
 * Setting prior injected into buildLocationsToolsGuidance.
 * Tells Cesare WHERE the film is set so it searches in the right city/region.
 */
export const formatBibleForLocations = (bible: FilmBible): string => {
  const locationPriors = bible.recurringLocations
    .filter((loc) => loc.settingPrior.trim().length > 0)
    .map((loc) => `  - ${loc.canonicalName}: ${loc.settingPrior}`)
    .join("\n");

  const priorBlock =
    locationPriors.length > 0
      ? `\nLocation principali del film:\n${locationPriors}`
      : "";

  return `SETTING PRIOR (leggi prima di ogni ricerca):
Il film è ambientato in: ${bible.settingSummary}${priorBlock}
Quando usi search_places, aggiungi sempre la città/regione del film come location_bias.
Non cercare a Roma o in città capitali a meno che il film non sia esplicitamente ambientato lì.`;
};
