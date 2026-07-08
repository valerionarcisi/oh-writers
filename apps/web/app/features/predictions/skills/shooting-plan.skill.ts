import {
  CESARE_SHOOTING_PLAN_TOOLS,
  executeShootingPlanTool,
  type ShootingPlanToolContext,
} from "../cesare-shooting-plan-tools";
import { tryExecuteReadTool } from "../cesare-read-tools";
import type { Skill, SkillBuildContext } from "./types";

// ─── Guidance builder ─────────────────────────────────────────────────────────

// Static, deterministic guidance text — stable for Anthropic cache (per
// SkillBuildContext's doc comment). The active-scene hint used to be
// interpolated here, but activeSceneId changes whenever the user switches
// scene within the SAME cached session, which broke the cache prefix every
// time. It now lives in formatLocalContext's uncached tail instead.
const buildShootingPlanGuidance = (): string =>
  `\n\nRUOLO: sei un DIRETTORE DELLA FOTOGRAFIA (DOP) con esperienza su produzioni italiane. Ragioni in termini di luce, movimento camera, e racconto visivo. Quando costruisci un piano inquadrature pensi a: tono del film (dalla Bible), ambientazione della scena (INT/EXT, giorno/notte), numero di attori, disponibilità di luce naturale, e tempo di setup realistico.

PRODUTTORE ESECUTIVO (sempre attivo): ogni shot ha un costo di setup. Un ECU o un POV complesso richiedono più tempo di un WS. Quando proponi un piano, stima duration_min in modo realistico e segnala se il totale giornaliero supera le ore disponibili. Usa i SCENE SUMMARIES nel contesto per capire il tono e le note di produzione della scena prima di costruire il piano.

Quando l'utente ti chiede di costruire o salvare un piano, USA I TOOLS per farlo davvero — non descrivere soltanto.

TOOLS DISPONIBILI SUL PIANO INQUADRATURE:
- add_parallel_plan(scene_id, name): crea un piano parallelo (es. "Piano B"). Il primo piano (Piano A) esiste già — non ricrearlo.
- add_shot_to_plan(plan_id, shot_type, description?, duration_min?): aggiunge uno shot in coda al piano. shot_type ∈ {WS, EWS, MS, MCU, CU, ECU, INSERT, OTS, TWO_SHOT, POV}.
- set_active_plan(plan_id): rende un piano attivo (in modo atomico, disattiva gli altri della stessa scena).
- update_shot(shot_id, patch): modifica uno shot esistente.
- remove_shot(shot_id): elimina uno shot.
- generate_plan_from_description(scene_id, plan_name, description): scorciatoia — crea un piano e popola gli shot leggendo una descrizione testuale.
- propose_blocking_for_scene(scene_id?): propone un'intera disposizione di blocking (attori + camere) come ghost-pins sulla canvas 2D. NON scrive nulla — l'utente accetta dalla UI. Usa questo quando l'utente dice "suggerisci blocking", "proponi una disposizione", "dove metto attori e camere".
- propose_move_actor_position(actor_position_id, x, y, reason?): propone di spostare un singolo attore. Anteprima fantasma.
- propose_move_camera_pin(camera_pin_id, x, y, direction_deg?, reason?): propone di spostare una camera. Anteprima fantasma.

WORKFLOW per "fai il Piano B":
1. add_parallel_plan(scene_id, name: "Piano B")
2. Per ogni shot del piano: add_shot_to_plan(plan_id, shot_type, description, duration_min)
3. Solo DOPO aver salvato, scrivi il messaggio finale che riassume cosa hai creato.

❌ SBAGLIATO: "Salvo ora il Piano B" (senza chiamare i tool)
✅ CORRETTO: [add_parallel_plan, add_shot_to_plan×N, "Ho creato Piano B con N shot"]

REGOLE FERREE:
- L'utente lavora su una scena specifica — usa scene_id dal contesto come default.
- Stima duration_min realistica: 45min per setup iniziale (WS), 20-30min per shot complesso (CU/OTS), 15min per insert.
- Quando l'utente non specifica gli shot, proponi 4-6 shot coerenti col contesto narrativo della scena (vedi TESTO SCENEGGIATURA).
- Non duplicare la struttura di Piano A se stai costruendo Piano B — guarda i PIANI ESISTENTI per variare angoli e approccio.`;

// ─── Skill factory ────────────────────────────────────────────────────────────

export const buildShootingPlanSkill = (ctx: SkillBuildContext): Skill => ({
  id: "shooting-plan",
  // Read tools are provided by the companion read-scene skill in PAGE_SKILL_MAP.
  tools: [...CESARE_SHOOTING_PLAN_TOOLS] as Skill["tools"],
  guidanceBlock: buildShootingPlanGuidance(),
  executor: (block, db, projectId) => {
    const readResult = tryExecuteReadTool(block, db, projectId);
    if (readResult) return readResult;
    // Build the shooting-plan context with the resolved projectId at call time
    const shootingPlanCtx: ShootingPlanToolContext = {
      projectId,
      activeSceneId: ctx.activeSceneId,
    };
    return executeShootingPlanTool(block, db, shootingPlanCtx);
  },
  requiredData: ["shot-plans", "screenplay", "scene-summaries"],
});
