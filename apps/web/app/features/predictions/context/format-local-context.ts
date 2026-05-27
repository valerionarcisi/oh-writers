import type { LocalContext } from "@oh-writers/domain";

/**
 * Serialises LocalContext into the dynamic (uncached) final system prompt block.
 * This text changes on every call — no cache_control is applied to it.
 */
export const formatLocalContext = (ctx: LocalContext): string => {
  const parts: string[] = [];

  if (ctx.scenes.length > 0) {
    const sceneLines = ctx.scenes
      .slice(0, 200)
      .map((s) => `  ${s.number}. ${s.heading}`)
      .join("\n");
    const truncationNote =
      ctx.scenes.length > 200
        ? `\n  …e altre ${ctx.scenes.length - 200} scene (usa read_scene/read_scene_range per il dettaglio)`
        : "";
    parts.push(
      `SCENE LIST (${ctx.scenes.length} scenes):\n${sceneLines}${truncationNote}`,
    );
  }

  if (ctx.currentScene !== null) {
    parts.push(
      `ACTIVE SCENE: ${ctx.currentScene.number}. ${ctx.currentScene.heading}`,
    );
  }

  if (ctx.sceneWindow.length > 0) {
    const windowLines = ctx.sceneWindow.map((s) => {
      const label = s.isCurrent ? "→ ACTIVE" : "  ";
      const chars =
        s.characterNames.length > 0 ? ` [${s.characterNames.join(", ")}]` : "";
      const body = s.body !== null ? `\n  ${s.body.slice(0, 300)}` : "";
      return `${label} SC.${s.number} ${s.heading}${chars}${body}`;
    });
    parts.push(`SCENE WINDOW (±2):\n${windowLines.join("\n\n")}`);
  }

  if (ctx.characters.length > 0) {
    parts.push(`CHARACTERS: ${ctx.characters.join(", ")}`);
  }

  if (ctx.activeDocument !== null) {
    parts.push(
      `ACTIVE DOCUMENT [${ctx.activeDocument.type.toUpperCase()}]:\n${ctx.activeDocument.content.slice(0, 2000)}`,
    );
  }

  return parts.length > 0 ? parts.join("\n\n") : "(no local context)";
};
