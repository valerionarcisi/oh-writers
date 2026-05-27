import {
  CESARE_SCHEDULE_TOOLS,
  executeScheduleTool,
  type ScheduleToolContext,
} from "../cesare-schedule-tools";
import { tryExecuteReadTool } from "../cesare-read-tools";
import type { Skill, SkillBuildContext } from "./types";

// ─── Guidance builder ─────────────────────────────────────────────────────────

const buildScheduleGuidance = (activeDayNumber: number | null): string => {
  const activeHint = activeDayNumber
    ? `\nGiornata attiva (selezionata dall'utente): Giornata ${activeDayNumber}. Quando l'utente dice "questa giornata" si riferisce a questa.`
    : "";
  return `\n\nTOOLS DISPONIBILI SUL PIANO DI LAVORAZIONE:
- move_scene_to_day(scene_number, target_day_number): sposta una scena su un'altra giornata.
- merge_days(day_a_number, day_b_number): accorpa due giornate (le scene di B vanno in A, B viene rimossa).
- swap_scenes(scene_a_number, scene_b_number): scambia la posizione di due scene.
- lock_day(day_number) / unlock_day(day_number): blocca/sblocca tutte le strip di una giornata.
- get_weather_forecast(lat, lng, date): previsioni Open-Meteo per data + coordinate (entro 16 giorni). Usalo per valutare il rischio meteo sugli esterni — la probabilità di riuscita della giornata cala con pioggia/temporale.
- suggest_reorder(strategy?, respect_location_confirmed?): proponi una sequenza ottimizzata (es. 'minimize_location_changes') senza applicarla; l'utente conferma. Passa respect_location_confirmed=true quando vedi giornate con location ancora "pending"/"scouting" — il tool penalizza lo spostare scene verso giornate con location non confermate e restituisce locationWarnings.

Quando l'utente chiede di riorganizzare lo schedule, USA i tools — non limitarti a descrivere il cambio. Per esterni con dubbi sul meteo, chiama get_weather_forecast prima di consigliare lo spostamento. Quando alcune scene hanno location non ancora confermate, chiama suggest_reorder con respect_location_confirmed=true. Conferma sempre in italiano cosa hai fatto e l'impatto sulla difficoltà/riuscita della giornata.${activeHint}`;
};

// ─── Skill factory ────────────────────────────────────────────────────────────

export const buildScheduleSkill = (ctx: SkillBuildContext): Skill => ({
  id: "schedule",
  // Read tools are provided by the companion read-scene skill in PAGE_SKILL_MAP.
  tools: [...CESARE_SCHEDULE_TOOLS] as Skill["tools"],
  guidanceBlock: buildScheduleGuidance(ctx.activeDayNumber),
  executor: (block, db, projectId) => {
    const readResult = tryExecuteReadTool(block, db, projectId);
    if (readResult) return readResult;
    // Build the schedule context with the resolved projectId at call time
    const resolvedCtx: ScheduleToolContext = {
      projectId,
      activeDayNumber: ctx.activeDayNumber,
    };
    return executeScheduleTool(block, db, resolvedCtx);
  },
  requiredData: ["schedule", "screenplay"],
});
