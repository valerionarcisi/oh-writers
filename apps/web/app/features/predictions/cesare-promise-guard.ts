import { mappingForTool } from "./cesare-tool-entity-map";
import { expectsWriteAct, type IntentResult } from "./cesare-intent-classifier";

// #118 — the promise-guard. Twin of #44 (F-A3): there the result card could
// not lie about a mutation; here the free-text reply could still PROMISE one
// ("procedo ora con la traduzione, ti avviserò") while the turn executed no
// write tool at all — a synchronous turn has no way to "notify later", so the
// user waits forever. The decision is on CLOSED DATA only: the classified
// intent (did the user confidently ask for a write act?) and the executed tool
// names (did any write tool actually run?). Never a text pattern on the reply
// — phrasing changes with every model and language, the data doesn't.
//
// An executed-but-asked tool (commitOrAsk ASK outcome) counts as acted: the
// ask card is an honest, visible outcome. A tool that errored does not count —
// nothing was applied, so the notice is the truth.

export const NO_ACTION_NOTICE =
  "\n\n⚠️ Nessuna modifica è stata applicata in questo turno. Se ti aspettavi un'azione, riformula la richiesta e riprova.";

export const needsNoActionNotice = (
  intent: IntentResult | null,
  executedToolNames: readonly string[],
): boolean =>
  expectsWriteAct(intent) &&
  !executedToolNames.some((name) => mappingForTool(name)?.access === "write");
