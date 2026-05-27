import type { SceneSummary } from "../scene-summary/schema.js";

export const formatSceneSummary = (summary: SceneSummary): string => {
  const lines: string[] = [
    `## Scena ${summary.sceneNumber}: ${summary.heading}`,
    `Setting: ${summary.settingDescription}`,
  ];

  if (summary.timeOfDay) {
    lines.push(`Orario: ${summary.timeOfDay}`);
  }

  if (summary.presentCharacters.length > 0) {
    lines.push(`Personaggi: ${summary.presentCharacters.join(", ")}`);
  }

  if (summary.keyActions.length > 0) {
    lines.push(`Azioni principali:`);
    for (const action of summary.keyActions) {
      lines.push(`  - ${action}`);
    }
  }

  if (summary.productionNotes.length > 0) {
    lines.push(`Note produzione:`);
    for (const note of summary.productionNotes) {
      lines.push(`  - ${note}`);
    }
  }

  return lines.join("\n");
};
