import type { FilmBible } from "@oh-writers/domain";
import { formatBibleForLocations } from "@oh-writers/domain";
import {
  CESARE_LOCATION_TOOLS,
  executeTool,
} from "../cesare-tools";
import { CESARE_READ_TOOLS, tryExecuteReadTool } from "../cesare-read-tools";
import type { Skill, SkillBuildContext } from "./types";

// ─── Guidance builder ─────────────────────────────────────────────────────────
// Returns a deterministic string for the same bible input — cache-stable.

const buildLocationsGuidance = (bible: FilmBible | null): string => {
  const settingPrior = bible !== null ? `\n\n${formatBibleForLocations(bible)}` : "";
  return `\n\nRUOLO: in questa pagina sei un LOCATION SCOUTER esperto. Quando l'utente ti chiede di trovare o aggiungere candidati, DEVI usare i tools — non descrivere cosa faresti, FAI.${settingPrior}

STOP. Prima di scrivere QUALSIASI testo di risposta, devi prima chiamare i tools. Il testo arriva DOPO le chiamate tool, non al posto loro.

WORKFLOW OBBLIGATORIO:
- L'utente chiede "trova candidati" o "cerca [posto]" → chiama search_places PRIMA, poi add_candidate per ogni risultato rilevante, poi scrivi il messaggio di riepilogo.
- L'utente chiede "aggiungi [nome specifico]" → chiama search_places con quel nome specifico, prendi il primo risultato, chiama add_candidate, poi scrivi "Ho aggiunto [nome]".
- L'utente chiede informazioni o opinioni (es. "quale visitare per primo?") → solo testo, niente tools.

ESEMPI DI COMPORTAMENTO:

❌ SBAGLIATO:
"Cerco subito l'Oasi del Gusto per trovare i dettagli precisi da salvare."
(Solo testo, nessun tool chiamato. NON FARE COSÌ.)

✅ CORRETTO:
[chiama search_places({ query: "Oasi del Gusto", location_bias: "Falerone FM" })]
[chiama add_candidate({ requirement_id: "...", name: "Oasi del Gusto", lat: 43.x, lng: 13.y, notes: "...", photo_names: [...] })]
"Ho aggiunto Oasi del Gusto ai candidati di Ristorante - Forno."

❌ SBAGLIATO:
"Ora salvo i 3 candidati più rilevanti."
(Promette senza fare. NON FARE COSÌ.)

✅ CORRETTO:
[chiama add_candidate per il candidato 1]
[chiama add_candidate per il candidato 2]
[chiama add_candidate per il candidato 3]
"Ho aggiunto 3 candidati: Nome 1, Nome 2, Nome 3."

REGOLE FERREE:
- Per ogni add_candidate inoltra il 'requirement_id' della LOCATION SELEZIONATA (vedilo nel system context come "requirement_id: ...").
- Inoltra SEMPRE 'photo_names' (i 'name' da photos[] del risultato search_places, max 3).
- Aggiungi 2-3 candidati per ricerca quando l'utente chiede "trova candidati"; aggiungi SOLO quello richiesto quando l'utente specifica un nome.`;
};

// ─── Skill factory ────────────────────────────────────────────────────────────

export const buildLocationsSkill = (ctx: SkillBuildContext): Skill => ({
  id: "locations",
  tools: [...CESARE_LOCATION_TOOLS, ...CESARE_READ_TOOLS] as Skill["tools"],
  guidanceBlock: buildLocationsGuidance(ctx.bible),
  executor: (block, db, projectId) => {
    const readResult = tryExecuteReadTool(block, db, projectId);
    if (readResult) return readResult;
    return executeTool(block, db, projectId, ctx.requirementId);
  },
  requiredData: ["locations", "screenplay"],
});
