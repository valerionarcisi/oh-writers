# Vernissage Wave 4 — Composite walkthrough cross-feature

## Built

- Branch: `main`
- Commits in arrivo (vedi sezione "Fix applicati live")
- Range: post-merge wave 1/2/3, sessione 2026-05-19

## User stories provate

### 1. Screenplay propose/accept — `PARTIAL`

**Cosa**: aprire Cesare nell'editor sceneggiatura, chiedere "rendi più tesa la scena 1".
**Atteso**: decoration inline con ✓/✕ + chiamata a `propose_screenplay_edit`.
**Trovato**:

- ✅ Editor carica
- ✅ Cesare panel apre
- ✅ Cesare risponde con suggerimenti rifiniture (Sc. 1 · 5 rifiniture)
- ❌ Tool `propose_screenplay_edit` NON chiamato — Cesare ha letto la scena ma ha solo _commentato_ invece di proporre micro-edit. Le rifiniture mostrate sono dei "ghost suggestions" da una pipeline diversa (vedi `cesareAppliedHighlightKey`).
- ❌ Leak `<tool_response>...</tool_response>` nel testo — visibile come paragraph nel chat. **Fissato in CesareSheet.stripToolCalls**.

**Root cause sospetto**: model router mandava "rendi" a Haiku, che evita tool calls multi-step. Fissato aggiungendo `rendi|spinge|tira|tendi` a `ITALIAN_IMPERATIVE_REGEX` → ora forza Sonnet.

### 2. Documents auto-gen — `PARTIAL`

**Cosa**: aprire pagina Soggetto vuoto, chiedere "scrivi il soggetto".
**Atteso**: banner DRAFT sopra l'editor con accept/reject + chiamata a `propose_soggetto_v2`.
**Trovato**:

- ✅ Skeleton primitive funziona (sostituito il `Loading…` plain text)
- ❌ Cesare ha scritto il soggetto **inline nel chat** invece di chiamare il tool
- ❌ Nessun banner DRAFT in pagina

**Root cause**: `scrivi/scrivimi` non era in `ITALIAN_IMPERATIVE_REGEX` → router mandava a Haiku. Fissato. Inoltre rinforzata la guidance `buildDocumentGenToolsGuidance` con regola forte sui documenti vuoti.

### 3. Budget weekly + cap — `OK`

**Cosa**: andare su Budget → tab "Settimane", impostare cap 50.000€.
**Atteso**: vista per settimana con breakdown + cap salvato.
**Trovato**:

- ✅ Tab "Settimane" funziona
- ✅ Settimana 1 · 3 giornate · 2–4 giu · 16.984 €
- ✅ Breakdown segments: Troupe 6780€ · Altro 8660€ · Contingenza 1544€
- ✅ Cap 50.000€ impostato inline (no modal, edit diretto in spinbutton)
- ⚠️ Fix UX live: chip "3dc1be... f1b7b6..." (UUID truncati) sostituiti con "N scene" pulito.

### 4. Locations area-search — `PARTIAL`

**Cosa**: pagina Locations, drawn circle sulla mappa, cluster POI, "Aggiungi candidato".
**Atteso**: AreaSearchPanel + popup cluster TripAdvisor-style.
**Trovato**:

- ✅ Pagina locations renderizza 6 requirements
- ✅ Mappa Google montata (4 elementi DOM container)
- ✅ Cesare risponde a "trova candidati a Falerone" — quick-replies follow-up presenti
- ⚠️ AreaSearchPanel non testabile via DOM snapshot — richiede interazione canvas Google Maps. Trigger sul `drawnCircle` state nel parent, panel monta solo se circle != null.

### 5. Shooting blocking propose — `OK FULL`

**Cosa**: aprire shooting-plan scena 1, chiedere "proponi il blocking".
**Atteso**: pin fantasma con accept.
**Trovato**:

- ✅ Cesare ha proposto 4 camere come ghost-pins (A·MS, B·WS, C·WS, D·WS)
- ✅ Buttons individuali ✓ Accetta / ✕ Scarta per ogni camera
- ✅ "Accetta tutto" / "Scarta tutto" bulk
- ✅ Accept All eseguito → Piano A attivo con 4 shot

## Bug live trovati e risolti

| #   | Bug                                                                       | File                                              | Stato                                |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| A   | Plain "Loading…" testo su screenplay/versions/title-page/documents        | 4 file routes                                     | ✅ fix → Skeleton primitive          |
| B   | `<tool_response>` leak nel chat Cesare                                    | `CesareSheet.tsx::stripToolCalls`                 | ✅ fix → aggiunto regex strip        |
| C   | Router mandava verbi `scrivi/proponi/rendi/tendi` a Haiku → no tool calls | `cesare-model-router.ts`                          | ✅ fix → regex estesa                |
| D   | UUID truncati visibili in Budget weekly chips                             | `BudgetWeeklyView.tsx`                            | ✅ fix → "N scene"                   |
| E   | Guidance doc-gen non abbastanza assertiva su documenti vuoti              | `cesare.server.ts::buildDocumentGenToolsGuidance` | ✅ fix → regola forte aggiunta       |
| F   | `getProjectById` chiamato con `projectId: ""` empty → 500                 | (loader projects)                                 | ⚠️ NOT fixed — investigazione futura |

## Test E2E mockato

Non aggiunto in questa wave (era una verifica live manuale). I 7 mock scenarios esistenti coprono già propose-\* per screenplay/documents/budget/blocking.

## Cost check

Sessione real Anthropic, niente smoke run dedicato. I numeri di riferimento restano `vernissage/cost-foundation.md`.

## Verifica manuale (Valerio)

- [x] Login funziona dopo rehash password (script `better-auth/crypto.hashPassword`)
- [x] Dashboard skeleton ok
- [x] Editor screenplay carica
- [x] Cesare apre e risponde
- [ ] **Da ri-verificare con router fix**: propose_screenplay_edit invocato
- [ ] **Da ri-verificare con router fix**: propose_logline_from_screenplay invocato → banner DRAFT
- [x] Budget weekly tab + cap
- [x] Locations Cesare attivo
- [x] Shooting blocking propose end-to-end con accept

## Limiti / next iteration

- Rolling test del fix router (richiede restart + sessione pulita)
- Bug F: empty `projectId` in `getProjectById` — probabilmente race in route loader, da investigare
- AreaSearchPanel: aggiungere E2E che inietta `drawnCircle` direttamente via API helper invece di simulare draw su Google Maps
- Login rate-limit: script `dev:reset-password` da scriptare per ripetere il rehash automaticamente
