/**
 * Mock framework for the Cesare agentic tool loop.
 *
 * Activated only when `process.env.MOCK_AI === "true"`. Provides a deterministic
 * drop-in replacement for the Anthropic SDK client. The real tool executors run
 * unchanged — only the LLM brain is faked.
 *
 * How scenarios are picked:
 * - The mock matches the *last user message* against each scenario's `match`
 *   pattern, in order. The first hit wins.
 * - Each scenario describes a sequence of LLM turns: a turn either emits
 *   `tool_use` blocks (the loop will execute them and call back) or emits text
 *   and ends the conversation.
 *
 * Per-conversation turn tracking:
 * - The mock keeps a Map<conversationKey, turnIndex>. The conversation key is
 *   built from the last user-message text. Each subsequent call within the
 *   same tool loop advances the index. When the index runs past the scenario
 *   length, the mock returns an end_turn with a generic acknowledgement so the
 *   loop terminates safely.
 *
 * Placeholder substitution:
 * - Tool inputs may include `{{KEY}}` placeholders. The mock substitutes them
 *   from the module-level context map set via `setMockContext()`. Tests call
 *   this through a dedicated test-only server function before each scenario.
 */

// Local block shapes — kept independent from anthropic-client.ts so the mock
// can decorate tool_use blocks with the required `id` field that
// runGenericToolLoop reads via `block.id`.
interface MockTextBlock {
  readonly type: "text";
  readonly text: string;
}
interface MockToolUseBlock {
  readonly type: "tool_use";
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}
type MockContentBlock = MockTextBlock | MockToolUseBlock;

// ─── Public mock context API ──────────────────────────────────────────────────
//
// We persist the context in `process.env` (keys are namespaced with the
// `OHW_MOCK_CTX_` prefix). TanStack Start splits the codebase across separate
// Vinxi routers (api, ssr, client) — each router instantiates its own module
// graph, so module-level state set from the api router would not be visible
// to the ssr router where the Cesare tool loop runs. `process.env` is the
// only Node-global both routers share.

const ENV_PREFIX = "OHW_MOCK_CTX_";

export const setMockContext = (ctx: Record<string, string>): void => {
  // Clear previous entries first so two consecutive tests cannot pollute each
  // other.
  clearMockContext();
  for (const [k, v] of Object.entries(ctx)) {
    process.env[`${ENV_PREFIX}${k}`] = v;
  }
};

export const getMockContext = (): Readonly<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith(ENV_PREFIX) && typeof v === "string") {
      out[k.slice(ENV_PREFIX.length)] = v;
    }
  }
  return out;
};

export const clearMockContext = (): void => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith(ENV_PREFIX)) {
      delete process.env[k];
    }
  }
};

// ─── Scenario shape ───────────────────────────────────────────────────────────

export interface MockToolUseEmission {
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export interface MockTurn {
  readonly tool_uses?: ReadonlyArray<MockToolUseEmission>;
  readonly text?: string;
  readonly stop_reason: "tool_use" | "end_turn";
}

export interface MockScenario {
  readonly match: string | RegExp;
  readonly turns: ReadonlyArray<MockTurn>;
}

// ─── Default scenario library (one per feature) ───────────────────────────────

export const MOCK_SCENARIOS: ReadonlyArray<MockScenario> = [
  // Context engineering (spec 38) — verify setting prior injected + no Rome
  {
    match:
      /dove siamo ambientati|dove è ambientato il film|setting del film|film bible/i,
    turns: [
      {
        text: "Il film è ambientato in un ristorante di provincia nelle Marche. Non si tratta di Roma né di una grande città.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Locations — search_places + add_candidate flow
  {
    match:
      /trova candidati|trova location|cerca candidat|trova una piazza|trova due bar|cerca ristorant|trova un|trova locand|trova ristorant/i,
    turns: [
      {
        tool_uses: [
          {
            name: "add_candidate",
            input: {
              requirement_id: "{{REQ_ID}}",
              name: "Ristorante Da Cesare",
              address: "Via Roma 42, Roma",
              lat: 41.9028,
              lng: 12.4964,
              notes:
                "Vetrata sulla strada, luce notturna calda. Adatto alla scena del dialogo.",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiunto 1 candidato trovato. Verifica la vetrata e la luce notturna sul posto.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — expand_section
  {
    match:
      /espandi la sezione|espandi atto|sviluppa la sezione|espandi sezione|espandi il secondo atto|espandi atto ii/i,
    turns: [
      {
        tool_uses: [
          {
            name: "expand_section",
            input: { heading: "Atto II" },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho espanso la sezione Atto II con due paragrafi aggiuntivi. Il documento è stato aggiornato.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — apply_text_edit (deterministic find/replace; no LLM call).
  // Used by the [OHW-047-A6] word-level live-diff E2E: the soggetto seed
  // contains "traduttrice freelance", so this produces a real before→after diff.
  {
    match:
      /sostituisci .*traduttrice|cambia traduttrice|interprete simultanea/i,
    turns: [
      {
        tool_uses: [
          {
            name: "apply_text_edit",
            input: {
              find: "traduttrice freelance",
              replace: "interprete simultanea",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiornato il soggetto sostituendo la professione di Marta. Il documento è stato aggiornato.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — compress_section
  {
    match: /accorcia|riassumi|comprimi/i,
    turns: [
      {
        tool_uses: [
          {
            name: "compress_section",
            input: { heading: "Atto II", target_words: 120 },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho compresso la sezione mantenendo i beat chiave. Documento aggiornato.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Breakdown — estimate_scene_cost
  {
    match: /stima il costo della scena|costo della scena|stima costo/i,
    turns: [
      {
        tool_uses: [
          {
            name: "estimate_scene_cost",
            input: { scene_number: "{{SCENE_NUMBER:number}}" },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Costo stimato per la scena: circa €4.200/giornata. Difficoltà bassa. La spesa principale è il cast.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Schedule — move_scene_to_day
  {
    match: /sposta la scena .* al giorno|sposta scena .* giorno/i,
    turns: [
      {
        tool_uses: [
          {
            name: "move_scene_to_day",
            input: {
              scene_number: "{{SCENE_NUMBER:number}}",
              target_day: "{{TARGET_DAY:number}}",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho spostato la scena al giorno richiesto. Lo schedule è stato aggiornato.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Budget — set_budget_cap (OHW-590)
  {
    match:
      /imposta tetto|imposta il tetto|fissa il tetto|metti un tetto|metti un cap|non superare/i,
    turns: [
      {
        tool_uses: [
          {
            name: "set_budget_cap",
            input: {
              scope: { kind: "global" },
              amount_cents: 5000000,
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho impostato il tetto budget globale a €50.000.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Budget — evaluate_against_cap (OHW-591)
  {
    match:
      /siamo nel budget|siamo dentro budget|quanto rimane|residuo budget|quanto manca al tetto/i,
    turns: [
      {
        tool_uses: [
          {
            name: "evaluate_against_cap",
            input: {},
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Stato budget: rispetto al tetto restano circa €12.000 di residuo. Sei dentro il limite.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Budget — propose_excessive_lines_flags (OHW-592)
  {
    match:
      /voci eccessive|voci troppo costose|cosa costa troppo|cosa sfora di piu|voci anomale/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_excessive_lines_flags",
            input: {},
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho trovato alcune voci sopra la media di categoria. Verifica le righe segnalate: decidi tu se ridurle.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Budget — update_budget_line (decrease)
  {
    match: /abbassa la voce|riduci la voce|abbassa la riga|diminuisci la voce/i,
    turns: [
      {
        tool_uses: [
          {
            name: "update_budget_line",
            input: {
              line_id: "{{BUDGET_LINE_ID}}",
              field: "rate",
              value: "{{NEW_RATE:number}}",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiornato la voce: il rate è stato modificato. Verifica il totale aggiornato.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Cost-foundation — read_scene lazy-RAG (OHW-561)
  // Triggered by a question about a specific scene's dialogue. The first
  // turn invokes the read_scene tool; the second turn cites a string from
  // the seeded scene 1 notes so the spec can assert on it.
  {
    match:
      /che dice john nella scena|cosa dice john nella scena|john nella scena 1|dialogo della scena 1/i,
    turns: [
      {
        tool_uses: [
          {
            name: "read_scene",
            input: { scene_number: 1 },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Nella scena 1 John dice: \"Non avrei mai dovuto tornare in questo posto.\" È un'apertura che pesa: regret prima dell'azione.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — write_logline EDIT existing (OHW-047-A8).
  // "rendi la logline più corta/tesa", "accorcia la logline",
  // "cambia il protagonista della logline". Placed before the WRITE + propose_*
  // scenarios so the edit verbs win.
  {
    match:
      /rendi la logline|logline più corta|logline piu corta|logline più tesa|logline piu tesa|logline più asciutta|logline piu asciutta|logline più incisiva|logline piu incisiva|accorcia la logline|cambia il protagonista della logline|modifica la logline|riscrivi la logline/i,
    turns: [
      {
        tool_uses: [
          {
            name: "write_logline",
            input: { instruction: "rendila più corta e tesa", mode: "edit" },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho modificato la logline: l'ho applicata direttamente al documento. Apri il pannello Versioni per ripristinare la versione precedente.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — write_logline WRITE from a free instruction (OHW-047-A8 + R3).
  // Covers the many ways a writer asks to write a logline from scratch:
  // "scrivimi/buttami giù/abbozza/metti giù/dammi/sviluppa una logline (su…)".
  // Matched before propose_logline_from_screenplay; only the explicit "dalla
  // sceneggiatura" / "estrai" wording (below) routes to the extraction tool.
  {
    match:
      /scrivimi una logline|scrivi una logline|scrivimi la logline|scrivi la logline|buttami giù (una|la) logline|buttami giu (una|la) logline|butta giù (una|la) logline|butta giu (una|la) logline|abbozza(mi)? (una|la) logline|metti giù (una|la) logline|metti giu (una|la) logline|dammi (una|la) logline|sviluppa la logline|logline su un|logline su una|logline dallo spunto|logline da questo spunto/i,
    turns: [
      {
        tool_uses: [
          {
            name: "write_logline",
            input: {
              instruction: "un detective insonne che insegue un killer",
              mode: "write",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho scritto la logline: l'ho applicata direttamente al documento. Apri il pannello Versioni per ripristinare la versione precedente.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — propose_logline_from_screenplay (OHW-575).
  // Only the explicit "derive from the screenplay" wording routes here; the
  // generic write phrasings above route to write_logline (from-zero capable).
  {
    match:
      /logline dalla sceneggiatura|estrai la logline|genera la logline dalla sceneggiatura/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_logline_from_screenplay",
            input: { instruction: "più commerciale" },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiornato la logline: l'ho applicata direttamente al documento. Apri il pannello Versioni per ripristinare la versione precedente.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — propose_synopsis_from_screenplay (OHW-576 + R3).
  // All the ways a writer asks for the synopsis, including "riassumi".
  {
    match:
      /scrivimi la sinossi|scrivi la sinossi|genera la sinossi|generami la sinossi|fammi la sinossi|dammi (una|la) sinossi|buttami giù la sinossi|buttami giu la sinossi|abbozza(mi)? la sinossi|fai un riassunto|rendi la sinossi più|rendi la sinossi piu|sinossi dal soggetto/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_synopsis_from_screenplay",
            input: {},
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiornato la sinossi: l'ho applicata direttamente al documento. Apri il pannello Versioni per ripristinare la versione precedente.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — propose_soggetto_v2 (OHW-577 + R3).
  // Write-from-zero, derive-from-logline, and edit phrasings for the soggetto.
  // The cross-entity "aggiorna/allinea soggetto e sinossi" scenario below uses
  // different verbs, so there is no collision.
  {
    match:
      /scrivi(mi)? il soggetto|genera(mi)? il soggetto|fammi il soggetto|dammi il soggetto|buttami giù il soggetto|buttami giu il soggetto|abbozza(mi)? il soggetto|metti giù il soggetto|metti giu il soggetto|sviluppa il soggetto|soggetto dalla logline|soggetto dallo spunto|v2 del soggetto|riscrivi il soggetto|fammi un v2|soggetto piu asciutto|soggetto più asciutto|rendi il soggetto più|rendi il soggetto piu/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_soggetto_v2",
            input: {
              instruction: "più asciutto e tematico",
              label: "v2 asciutto",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiornato il soggetto con una nuova versione v2: l'ho applicata direttamente al documento. Apri il pannello Versioni per ripristinare la versione precedente.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — cross-entity edit (Spec 47d). A single turn touches BOTH the
  // soggetto AND the sinossi, so the server emits one live-diff marker per
  // document. Used by the [OHW-047d] cross-entity test to assert each touched
  // doc paints its own green inline highlight when opened.
  {
    match: /aggiorna soggetto e sinossi|allinea soggetto e sinossi/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_soggetto_v2",
            input: {
              instruction: "più asciutto e tematico",
              label: "v2 cross",
            },
          },
          {
            name: "propose_synopsis_from_screenplay",
            input: { instruction: "allinea al nuovo soggetto" },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiornato soggetto e sinossi e li ho applicati direttamente ai documenti. Apri il pannello Versioni per ripristinare le versioni precedenti.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — propose_scaletta_from_soggetto (OHW-578 + R3).
  // Write/derive phrasings for the scaletta (list of scenes).
  {
    match:
      /dato il soggetto fammi la scaletta|genera(mi)? la scaletta|fammi la scaletta|scrivimi la scaletta|scrivi la scaletta|dammi la scaletta|buttami giù la scaletta|buttami giu la scaletta|abbozza(mi)? la scaletta|scaletta dal soggetto|dividi la storia in scene|lista delle scene/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_scaletta_from_soggetto",
            input: { target_scene_count: 10 },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiornato la scaletta dal soggetto: l'ho applicata direttamente al documento. Apri il pannello Versioni per ripristinare la versione precedente.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Documents — propose_treatment_from_narrative (F-A2 audit fix).
  // The "Scrivi il trattamento dalla scaletta" next-step chip seeds
  // "Scrivi il trattamento a partire dalla scaletta…", and a free
  // "genera il trattamento dalla scaletta" request also dispatches here.
  {
    match:
      /scrivi(mi)? il trattamento|genera(mi)? il trattamento|fammi il trattamento|dammi il trattamento|buttami giù il trattamento|buttami giu il trattamento|abbozza(mi)? il trattamento|metti giù il trattamento|metti giu il trattamento|trattamento (a partire|dalla scaletta|dal soggetto)/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_treatment_from_narrative",
            input: {},
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho scritto il trattamento dal materiale a monte: l'ho applicato direttamente al documento. Apri il pannello Versioni per ripristinare la versione precedente.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Cost-foundation — short acknowledgement loop (OHW-562)
  // Matches a bare "ok" so we can drive the multi-turn cached-context test
  // without colliding with the other scenarios above. Each request returns
  // a one-line text turn and ends.
  {
    match: /^\s*ok\s*$/i,
    turns: [
      {
        text: "Ok, dimmi pure il prossimo passo.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Screenplay — propose_screenplay_edit (OHW-570).
  // "Rendi questa scena più tesa." → micro-edit on scene 1 of the team
  // screenplay (fountain seed: "Si accende una sigaretta."). The replace
  // string contains "le mani che tremano" so the spec assertion on the
  // post-accept fountain hits.
  {
    match:
      /rendi questa scena|rendi la scena|più tesa|piu tesa|più tensione|piu tensione/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_screenplay_edit",
            input: {
              scene_number: 1,
              find: "Si accende una sigaretta.",
              replace: "Si accende una sigaretta con le mani che tremano.",
              reason: "Aggiunge tensione fisica al gesto.",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho preparato una proposta di modifica sulla scena 1. Vai sull'editor: l'overlay ✓/✕ ti permette di accettarla o scartarla.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Screenplay — propose_screenplay_revision (OHW-571).
  // "Fammi una v2 più corta." → macro rewrite of the whole screenplay,
  // creates a DRAFT version. The reply mentions "v2" so the spec text
  // assertion (/preparat|v2|versione|draft|diff/) hits.
  {
    match:
      /fammi una v2|v2 più corta|v2 piu corta|riscrivi più corta|riscrivi piu corta|tutto in una stanza/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_screenplay_revision",
            input: {
              scope: { kind: "whole_screenplay" },
              instruction: "più corta, mantieni i beat chiave",
              label: "V2 — più corta",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho preparato una v2 draft della sceneggiatura. Apri il diff dal banner sopra l'editor per confrontarla con la versione corrente.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Screenplay — propose_rename_entity (OHW-572).
  // "Rinomina Giulio in Lucia." → whole-word rename on the screenplay.
  // The fountain seed has many GIULIO occurrences so the tool returns
  // multiple proposed_edits and the PM plugin decorates each match.
  {
    match: /rinomina|rinominare|cambia nome|sostituisci .* con/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_rename_entity",
            input: {
              kind: "character",
              from: "Giulio",
              to: "Lucia",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho preparato la proposta di rinomina: trovate diverse occorrenze del personaggio. Accetta in blocco dall'overlay sull'editor.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Spec 39 — verify read_scene skill is active on locations page [OHW-039e]
  // When the user asks about a scene from the locations context, Cesare must
  // call read_scene to fetch the body — confirming the read-scene skill is
  // selected by the V2 registry for the locations page.
  {
    match:
      /dimmi cosa succede nella scena 1|cosa succede nella scena 1|racconta la scena 1/i,
    turns: [
      {
        tool_uses: [
          {
            name: "read_scene",
            input: { scene_number: 1 },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Nella scena 1 si vede John che entra nel ristorante. È una scena di apertura con forte tensione emotiva.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Screenplay — rewrite_scene (OHW-041).
  // "Riscrivi la scena 1." → inline typewriter rewrite of scene 1.
  // The new_content is a self-contained Fountain scene starting with INT.
  // The executor embeds the content in a <!--ohw:rewrite-scene-b64:...--> marker
  // that the CesareSheet detects and fans out as a DOM event to the editor.
  {
    match:
      /riscrivi la scena|riscrivi scena|opzione b|dammi una versione alternativa della scena/i,
    turns: [
      {
        tool_uses: [
          {
            name: "rewrite_scene",
            input: {
              scene_number: 1,
              new_content:
                "INT. MAGAZZINO - NOTTE\n\nRICK entra lentamente, il respiro trattenuto.\n\nUna figura emerge dall'ombra.\n\nRICK\nNon mi aspettavo di trovarti qui.\n\nSilenzio. La tensione si taglia con un coltello.",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho riscritto la scena 1 con un tono più teso. Guarda il risultato nell'editor: accetta o rifiuta con i pulsanti ✓/✗.",
        stop_reason: "end_turn",
      },
    ],
  },

  // Shooting plan — propose_blocking_for_scene (OHW-580).
  // The real executor loads scene + cast and (in MOCK_AI=true) short-circuits
  // to parseCesareBlockingResponse with an empty LLM response, falling back
  // to a small demo proposal so the ghost UI still renders. We intentionally
  // omit `scene_id` from the tool input: the executor falls back to
  // ShootingPlanToolContext.activeSceneId, which the page sets via
  // setActiveScene() when the user picks a scene from the sidebar. That keeps
  // the test free of any setMockContext({ SCENE_ID }) bootstrap.
  {
    match:
      /suggerisci blocking|proponi blocking|proponi un blocking|dove metto attori|disposizione blocking|proposta blocking/i,
    turns: [
      {
        tool_uses: [
          {
            name: "propose_blocking_for_scene",
            input: {},
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho preparato una proposta di blocking: rivedi i ghost-pin sull'editor e accetta quelli che convincono.",
        stop_reason: "end_turn",
      },
    ],
  },

  // ── Spec 43 — universal tool layer ─────────────────────────────────────────

  // OHW-043-A: from any page, Cesare resolves the requirement_id himself via
  // list/create tools instead of asking the user. The test pre-seeds
  // setMockContext({ REQ_ID: <existing-seeded-req> }) so the chained
  // add_candidate lands on the right row even though the mock has no way to
  // pipe the real find_or_create result into the next turn.
  {
    match:
      /aggiungi candidat[io] per la scena 1|aggiungimi candidati per la scena 1|aggiungi questi candidati per la scena 1/i,
    turns: [
      {
        tool_uses: [
          {
            name: "find_or_create_requirement_for_scene",
            input: { scene_number: 1 },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        tool_uses: [
          {
            name: "add_candidate",
            input: {
              requirement_id: "{{REQ_ID}}",
              name: "Vesuviosesto",
              address: "Via Pisa 4, Sesto San Giovanni",
              notes:
                "Pizzeria con forno a legna, soffitto basso, atmosfera provinciale.",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho aggiunto Vesuviosesto al requirement della scena 1.",
        stop_reason: "end_turn",
      },
    ],
  },

  // OHW-043-B: from the locations page, Cesare can call rewrite_scene
  // (cross-feature). The marker should land in sessionStorage so the editor
  // picks it up on next mount.
  {
    match:
      /riscrivi la scena 1|rifai la scena 1|rewrite scena 1|opzione b per la scena 1/i,
    turns: [
      {
        tool_uses: [
          {
            name: "rewrite_scene",
            input: {
              scene_number: 1,
              new_content:
                "EXT. SESTO SAN GIOVANNI - NOTTE\n\nFilippo arriva di corsa dalla strada. Respira affannosamente. Si ferma davanti alla porta del Radice e si sistema la cravatta con le mani che tremano.\n\nDa dentro: risate, il suono sordo di qualcuno che parla in un microfono.",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      {
        text: "Ho riscritto la Scena 1 mettendo Filippo in primo piano. Vai sulla pagina Sceneggiatura per vedere l'overlay e accettarlo.",
        stop_reason: "end_turn",
      },
    ],
  },

  // OHW-043-C: from any page, when asked "what tools do you have", Cesare
  // should list tools across multiple domains (universal layer), not just the
  // page-bound ones.
  {
    match: /che tool hai|quali tool hai|quali strumenti hai|cosa puoi fare/i,
    turns: [
      {
        text: "Posso lavorare in tutte le aree del progetto:\n\n📜 SCENEGGIATURA — propose_screenplay_edit, rewrite_scene, merge_scenes, delete_scene\n💰 BUDGET — update_budget_line, add_budget_line, set_budget_cap\n📍 LOCATION — search_places, add_candidate, find_or_create_requirement_for_scene\n📅 SCHEDULE — move_scene_to_day, swap_scenes\n🎬 PIANO INQUADRATURE — add_parallel_plan, add_shot_to_plan\n📄 DOCUMENTI — apply_text_edit, expand_section\n\nSono un layer sopra il prodotto: dimmi cosa serve e lo faccio.",
        stop_reason: "end_turn",
      },
    ],
  },
];

// ─── Internal: placeholder substitution ───────────────────────────────────────

const PLACEHOLDER_RE = /^\{\{([A-Z0-9_]+)(?::([a-z]+))?\}\}$/;

const substituteValue = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const match = PLACEHOLDER_RE.exec(value);
  if (!match) return value;
  const key = match[1]!;
  const coerceTo = match[2];
  const resolved = process.env[`${ENV_PREFIX}${key}`];
  if (resolved === undefined) {
    // Leave the placeholder visible so the tool surface fails loudly
    // rather than silently passing a literal "{{REQ_ID}}" to the DB.
    return value;
  }
  if (coerceTo === "number") {
    const n = Number(resolved);
    return Number.isFinite(n) ? n : resolved;
  }
  return resolved;
};

const substituteInput = (
  input: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = substituteValue(v);
  }
  return out;
};

// ─── Internal: turn tracking ──────────────────────────────────────────────────

const TURN_INDEX = new Map<string, number>();

const conversationKeyFor = (messages: ReadonlyArray<unknown>): string => {
  // Use the first user message as the conversation key. The same key is hit
  // again on each follow-up call within a single tool loop, so we advance the
  // index per call.
  for (const m of messages) {
    if (
      typeof m === "object" &&
      m !== null &&
      (m as { role?: string }).role === "user"
    ) {
      const content = (m as { content?: unknown }).content;
      if (typeof content === "string") return content.toLowerCase();
      // For tool_result follow-ups the user content is an array. Fall back to
      // the first user-text message instead by continuing the loop.
    }
  }
  return "<empty>";
};

const lastUserText = (messages: ReadonlyArray<unknown>): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (
      typeof m === "object" &&
      m !== null &&
      (m as { role?: string }).role === "user"
    ) {
      const content = (m as { content?: unknown }).content;
      if (typeof content === "string") return content;
    }
  }
  return "";
};

const findScenario = (text: string): MockScenario | null => {
  for (const scenario of MOCK_SCENARIOS) {
    const match = scenario.match;
    if (
      match instanceof RegExp
        ? match.test(text)
        : text.toLowerCase().includes(match.toLowerCase())
    ) {
      return scenario;
    }
  }
  return null;
};

// ─── AI SDK mock model ────────────────────────────────────────────────────────
// Uses MockLanguageModelV3 from "ai/test" so the MOCK_AI path runs the same
// generateText code path as production — only the LLM brain is faked.

import { MockLanguageModelV3 } from "ai/test";

// Type aliases derived from MockLanguageModelV3 so we avoid importing from
// the transitive @ai-sdk/provider package directly.
type MockDoGenerateOptions = Parameters<
  InstanceType<typeof MockLanguageModelV3>["doGenerate"]
>[0];
type MockGenerateResult = Awaited<
  ReturnType<InstanceType<typeof MockLanguageModelV3>["doGenerate"]>
>;

const FALLBACK_TEXT =
  "Ho letto la tua richiesta ma non ho strumenti specifici da invocare per questo caso.";

let TOOL_USE_COUNTER = 0;
const nextToolUseId = (): string => {
  TOOL_USE_COUNTER += 1;
  return `mock_tool_use_${TOOL_USE_COUNTER}`;
};

// Extracts the last user text from an AI SDK LanguageModelV3Prompt. User
// messages carry content as an array of text-part objects; we flatten them.
const lastUserTextFromPrompt = (
  prompt: MockDoGenerateOptions["prompt"],
): string => {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i];
    if (!msg || msg.role !== "user") continue;
    const parts = msg.content as Array<{ type: string; text?: string }>;
    const text = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join(" ")
      .trim();
    if (text) return text;
  }
  return "";
};

// Bug #4 / no-false-success — a scripted scenario's final turn is a fixed
// success acknowledgement ("Ho aggiornato il soggetto…"). When the PRECEDING
// tool actually errored (e.g. a from-scratch generator with no upstream to build
// from), claiming success would be a fabricated result. We scan the latest
// tool-result parts in the prompt for an `{ "error": … }` payload and, when
// present, the model emits a faithful failure message instead of the scripted
// success text. Model-independent: the real provider gets the same error
// tool_result and is expected to report the failure too.
const FAILURE_TEXT =
  "Non sono riuscito a completare la modifica: non c'era abbastanza materiale da cui generare. Scrivi prima il passo precedente della catena.";

const lastToolResultsErrored = (
  prompt: MockDoGenerateOptions["prompt"],
): boolean => {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i];
    if (!msg) continue;
    if (msg.role !== "tool") continue;
    const parts = msg.content as Array<{ type: string; output?: unknown }>;
    let sawToolResult = false;
    let allErrored = true;
    for (const part of parts) {
      if (part.type !== "tool-result") continue;
      sawToolResult = true;
      const text = JSON.stringify(part.output ?? "");
      if (!/"error"\s*:/.test(text)) allErrored = false;
    }
    if (sawToolResult) return allErrored;
  }
  return false;
};

// The conversation key uses the first user message so subsequent tool-result
// turns within the same loop advance the turn index correctly.
const conversationKeyFromPrompt = (
  prompt: MockDoGenerateOptions["prompt"],
): string => {
  for (const msg of prompt) {
    if (msg.role !== "user") continue;
    const parts = msg.content as Array<{ type: string; text?: string }>;
    const text = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join(" ")
      .trim();
    if (text) return text.toLowerCase();
  }
  return "<empty>";
};

const buildGenerateResult = (turn: MockTurn): MockGenerateResult => {
  const content: MockGenerateResult["content"] = [];

  if (turn.text && turn.text.length > 0) {
    content.push({ type: "text", text: turn.text });
  }

  if (turn.tool_uses && turn.tool_uses.length > 0) {
    for (const tu of turn.tool_uses) {
      content.push({
        type: "tool-call",
        toolCallId: nextToolUseId(),
        toolName: tu.name,
        // LanguageModelV3ToolCall.input must be a stringified JSON string
        input: JSON.stringify(substituteInput(tu.input)),
      });
    }
  }

  const unifiedFinishReason =
    turn.stop_reason === "tool_use" ? "tool-calls" : "stop";

  return {
    content,
    finishReason: { unified: unifiedFinishReason, raw: turn.stop_reason },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 20, text: 20, reasoning: 0 },
    },
    warnings: [],
  };
};

export const createMockCesareModel = (): MockLanguageModelV3 =>
  new MockLanguageModelV3({
    provider: "mock-cesare",
    modelId: "mock-cesare-model",
    doGenerate: async (
      options: MockDoGenerateOptions,
    ): Promise<MockGenerateResult> => {
      const userText = lastUserTextFromPrompt(options.prompt);
      const key = conversationKeyFromPrompt(options.prompt);
      const scenario = findScenario(userText);

      if (!scenario) {
        TURN_INDEX.delete(key);
        return {
          content: [{ type: "text", text: FALLBACK_TEXT }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 20, text: 20, reasoning: 0 },
          },
          warnings: [],
        };
      }

      const idx = TURN_INDEX.get(key) ?? 0;
      const turn = scenario.turns[idx];

      if (!turn) {
        TURN_INDEX.delete(key);
        return {
          content: [
            {
              type: "text",
              text: scenario.turns.at(-1)?.text ?? FALLBACK_TEXT,
            },
          ],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 20, text: 20, reasoning: 0 },
          },
          warnings: [],
        };
      }

      TURN_INDEX.set(key, idx + 1);

      // Reset so the scenario restarts cleanly on the next use.
      if (idx + 1 >= scenario.turns.length) {
        TURN_INDEX.delete(key);
      }

      // No false success on a no-op: if this turn would emit a scripted success
      // text but the preceding tool errored, report the failure instead.
      const isPlainTextTurn = !turn.tool_uses || turn.tool_uses.length === 0;
      if (isPlainTextTurn && lastToolResultsErrored(options.prompt)) {
        return {
          content: [{ type: "text", text: FAILURE_TEXT }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 20, text: 20, reasoning: 0 },
          },
          warnings: [],
        };
      }

      return buildGenerateResult(turn);
    },
  });

// ─── Legacy Anthropic-style client (kept for createMockStreamingClient) ───────
// The streaming path (callCesare in cesare.server.ts) still uses the raw
// messages.stream() interface via loadAnthropicStreamingClient. This client
// is NOT used by the agentic tool loop any more — that path now goes through
// createMockCesareModel + generateText.

interface AnthropicResponse {
  content: MockContentBlock[];
  stop_reason: string | null;
}

interface MockAnthropicMessagesClient {
  readonly messages: {
    create(args: Record<string, unknown>): Promise<AnthropicResponse>;
  };
}

const turnToBlocks = (turn: MockTurn): MockContentBlock[] => {
  const blocks: MockContentBlock[] = [];
  if (turn.text && turn.text.length > 0) {
    blocks.push({ type: "text", text: turn.text });
  }
  if (turn.tool_uses && turn.tool_uses.length > 0) {
    for (const tu of turn.tool_uses) {
      blocks.push({
        type: "tool_use",
        id: nextToolUseId(),
        name: tu.name,
        input: substituteInput(tu.input),
      });
    }
  }
  return blocks;
};

export const createMockAnthropicClient = (): MockAnthropicMessagesClient => ({
  messages: {
    create: async (
      args: Record<string, unknown>,
    ): Promise<AnthropicResponse> => {
      const messages =
        (args["messages"] as ReadonlyArray<unknown> | undefined) ?? [];
      const userText = lastUserText(messages);
      const key = conversationKeyFor(messages);
      const scenario = findScenario(userText);

      if (!scenario) {
        TURN_INDEX.delete(key);
        return {
          content: [{ type: "text", text: FALLBACK_TEXT }],
          stop_reason: "end_turn",
        };
      }

      const idx = TURN_INDEX.get(key) ?? 0;
      const turn = scenario.turns[idx];

      if (!turn) {
        TURN_INDEX.delete(key);
        return {
          content: [
            {
              type: "text",
              text: scenario.turns.at(-1)?.text ?? FALLBACK_TEXT,
            },
          ],
          stop_reason: "end_turn",
        };
      }

      TURN_INDEX.set(key, idx + 1);
      const content = turnToBlocks(turn);

      // If this is the final turn for the scenario, reset the counter so the
      // next time the same prompt arrives the scenario restarts from turn 0.
      if (idx + 1 >= scenario.turns.length) {
        TURN_INDEX.delete(key);
      }

      return {
        content,
        stop_reason: turn.stop_reason,
      };
    },
  },
});

// ─── Streaming client (used by callCesare for non-agentic pages) ──────────────

interface MockMessageStream {
  on(event: "inputJson", listener: (delta: string) => void): MockMessageStream;
  finalMessage(): Promise<{ content: Array<{ type: string; text?: string }> }>;
}

interface MockStreamingMessagesClient {
  readonly messages: {
    stream(args: Record<string, unknown>): MockMessageStream;
  };
}

const STREAMING_FALLBACK_TEXT =
  "Ho ricevuto la tua richiesta e ho analizzato il contesto del progetto. Cosa vuoi fare?";

export const createMockStreamingClient = (): MockStreamingMessagesClient => ({
  messages: {
    stream: (args: Record<string, unknown>): MockMessageStream => {
      const messages =
        (args["messages"] as ReadonlyArray<unknown> | undefined) ?? [];
      const userText = lastUserText(messages);
      const scenario = findScenario(userText);
      const replyText =
        scenario?.turns.find((t) => t.text)?.text ?? STREAMING_FALLBACK_TEXT;
      const stream: MockMessageStream = {
        on: () => stream,
        finalMessage: async () => ({
          content: [{ type: "text", text: replyText }],
        }),
      };
      return stream;
    },
  },
});
