# Spec 30 — Bandi & Finanziamenti

## Vision

Un filmmaker italiano che lavora su un progetto in Oh Writers apre la sezione Bandi, compila 5 campi sul suo profilo produttivo, e vede immediatamente 8–10 opportunità di finanziamento ordinate per compatibilità con il suo progetto — con importo, scadenza e link al portale ufficiale. Nessuna ricerca manuale, nessun aggregatore esterno da consultare.

La feature nasce dalla frammentazione reale del settore: i bandi sono decine, distribuiti su 19 portali regionali, il MiC, Creative Europe, Eurimages e portali privati. Nessun filmmaker conosce tutti i canali disponibili.

---

## Canali di Finanziamento Coperti

| Tipo | Esempi | Note |
|------|--------|------|
| `public_national` | MiC Sviluppo, MiC Produzione, MiC Distribuzione | Portale: cinema.cultura.gov.it |
| `public_regional` | Film Commission Puglia, Sardegna, Calabria, Toscana, Piemonte, ecc. | 19 regionali, strutture eterogenee |
| `european_media` | Creative Europe MEDIA Development/Production/Distribution | 97M€ disponibili 2026, scadenze strutturate |
| `eurimages` | Development Grant, Co-production Fund | Fondo Consiglio d'Europa |
| `tax_credit` | Tax Credit Produzione (40% spese per indipendenti) | Rolling, nessuna scadenza periodica |
| `international_coprod` | Bando Italia-Francia, accordi bilaterali | Scadenze variabili |
| `broadcaster_presale` | RAI Cinema, Sky, Mediaset | Accordi privati, inserimento manuale |
| `platform_presale` | Netflix, Amazon, Apple TV+ | Accordi privati, inserimento manuale |
| `crowdfunding` | Produzioni, Kickstarter | Utile per doc e progetti di nicchia |
| `private_investment` | Equity, tax shelter privato | Investitore detrae 40% dalle sue tasse |
| `festival_residency` | Biennale College Cinema, Torino Film Lab, Sundance Lab, Cinéfondation | Sviluppo, non produzione |

---

## Schema Dati

### `funding_opportunities`

Catalogo centralizzato. Gestito da admin (inserimento manuale + semi-automazione selettiva).

```ts
funding_opportunities {
  id: uuid PK
  title: string
  slug: string UNIQUE
  description: text | null
  sourceUrl: string | null          // link pagina ufficiale — sempre visibile in UI

  // Tassonomia
  fundingType: FundingType
  level: FundingLevel               // 'national' | 'regional' | 'european' | 'international'
  region: ItalianRegion | null      // null se non regionale

  // Compatibilità
  compatibleFormats: Format[]       // jsonb — 'feature' | 'short' | 'series_episode' | 'pilot'
  compatiblePhases: ProjectPhase[]  // jsonb — 'development' | 'pre_production' | 'production' | 'post' | 'distribution'
  compatibleGenres: Genre[] | null  // null = tutti i generi

  // Importo
  amountMin: integer | null
  amountMax: integer | null
  amountFixed: integer | null
  amountNotes: string | null        // es. "fino al 30% del budget totale"

  // Scadenza
  deadlineType: DeadlineType        // 'fixed' | 'rolling' | 'periodic' | 'unknown'
  nextDeadline: date | null
  deadlinePeriodicity: string | null  // es. "annuale", "semestrale"
  deadlineNotes: string | null

  // Requisiti
  requiresProductionCompany: boolean  // default false
  requiresCoproduction: boolean       // default false
  requiresItalianCitizenship: boolean // default false
  minBudgetRequired: integer | null
  maxBudgetAllowed: integer | null
  otherRequirements: jsonb | null     // requisiti custom — punto di estensione per pre-fill futuro

  // Ciclo di vita
  status: OpportunityStatus         // 'draft' | 'active' | 'expired' | 'archived'
  lastVerifiedAt: timestamp | null  // admin ha verificato che il bando è ancora attivo
  expiresAt: timestamp | null       // TTL automatico per cleanup

  // Source semi-automazione
  dataSource: DataSource            // 'manual' | 'rss_mic' | 'rss_creative_europe' | 'rss_eurimages'
  externalId: string | null         // deduplicazione su import

  createdBy: uuid FK users
  createdAt: timestamp
  updatedAt: timestamp
}
```

### `project_funding_profile`

Attributi produttivi del progetto necessari per il match. Separato da `projects` — questi campi non servono all'editor, al breakdown o al budget.

```ts
project_funding_profile {
  id: uuid PK
  projectId: uuid FK projects UNIQUE  // 1:1

  productionPhase: ProjectPhase | null
  estimatedBudget: integer | null       // EUR
  productionRegion: ItalianRegion[] | null  // array — supporta co-produzioni multi-regione
  hasProductionCompany: boolean           // default false
  isCoproduction: boolean                 // default false
  directorIsItalian: boolean | null       // null = non specificato → warning sul match

  targetAudience: TargetAudience | null   // 'children' | 'youth' | 'general' | 'niche'
  isDocumentary: boolean                  // denormalizzato da genre per query rapide

  createdAt: timestamp
  updatedAt: timestamp
}
```

Creata automaticamente alla creazione del progetto (record vuoto). L'utente la compila nella sezione Bandi.

### `user_opportunity_interests`

Tracking esplicito dell'interesse utente per un'opportunità.

```ts
user_opportunity_interests {
  id: uuid PK
  userId: uuid FK users
  opportunityId: uuid FK funding_opportunities
  projectId: uuid | null FK projects   // interesse legato a progetto specifico

  status: InterestStatus    // 'watching' | 'applied' | 'rejected' | 'funded'
  notes: text | null        // note private dell'utente

  createdAt: timestamp
  updatedAt: timestamp

  UNIQUE (userId, opportunityId, projectId)
}
```

---

## Logica di Match

Il match è **deterministico** — nessun LLM nel calcolo del score. Formula strutturata, verificabile, <50ms per ~200 bandi.

### Hard Gates (bloccanti — score = 0 se fallisce)

- `format` del progetto non è in `compatibleFormats`
- `productionPhase` non è in `compatiblePhases`
- `requiresProductionCompany = true` e `hasProductionCompany = false`
- `requiresCoproduction = true` e `isCoproduction = false`
- `estimatedBudget` < `minBudgetRequired`
- `estimatedBudget` > `maxBudgetAllowed`
- Bando regionale: `region` non interseca `productionRegion` del progetto

### Soft Score (0–100 per bandi che passano i gate)

```
score = base 40

// Regione (30 punti)
if level = 'national' | 'european' | 'international':  +15
if level = 'regional' and region ∩ productionRegion ≠ ∅: +30

// Genere (20 punti)
if compatibleGenres = null: +10    // accetta tutti i generi
if project.genre ∈ compatibleGenres: +20

// Budget nel range ottimale (15 punti)
if estimatedBudget è nel range mid del bando: +15

// Urgenza scadenza (20 punti — boost ranking, non compatibilità)
if nextDeadline entro 30 giorni: +20
if nextDeadline entro 90 giorni: +10

// Penalità dato mancante
if requiresItalianCitizenship and directorIsItalian = null: -5
```

**Soglie UI**:
- **90–100**: Eccellente match → badge teal pieno
- **70–89**: Buon match → badge teal
- **50–69**: Match parziale → badge amber
- **<50**: Match basso → non mostrato di default, visibile con filtro "Mostra tutti"

### Tax Credit — Logica Speciale

`deadlineType = rolling` — nessuna scadenza, sempre disponibile.

- Se `hasProductionCompany = false`: compare in lista con stato "Non ancora disponibile — richiede società di produzione". Non escluso, non genera notifiche di scadenza.
- Se `hasProductionCompany = true`: score = 100 (sempre compatibile se hai la struttura).
- Genera notifica `new_match` quando il profilo passa da `hasProductionCompany = false` a `true`.

### Spiegazione Narrativa (LLM, on-demand)

Per bandi con score ≥ 70, su richiesta esplicita dell'utente, Cesare genera una spiegazione in italiano ≤120 parole. Cachata 24h per coppia `(opportunityId, projectId)`. Non è nel path di rendering della lista — è un'azione esplicita.

---

## Gestione Contenuto

### Flusso di Pubblicazione

```
Draft → (revisione admin + completamento campi) → Active
Active → (job cron o admin) → Expired → (se rinnovato) → Active
Active → (admin) → Archived
```

I bandi in stato `draft` non compaiono in UI e non generano notifiche.

### Admin Panel `/admin/opportunities`

- Form strutturato che mappa la tabella — obbligatorio per i campi chiave prima di pubblicare
- Checklist completezza record (% di campi compilati)
- Preview match simulato su progetto campione prima di pubblicare
- Solo account con ruolo `system_admin`

### Semi-automazione Selettiva

Solo per fonti con struttura stabile:

| Fonte | Metodo | Campi automatici | Campi manuali |
|-------|--------|-----------------|---------------|
| MiC (cinema.cultura.gov.it) | RSS feed giornaliero | title, sourceUrl, nextDeadline | tutti gli altri |
| Creative Europe MEDIA | Import manuale annuale | tutti | aggiornamento annuale |
| Eurimages | Import manuale periodico | tutti | aggiornamento periodico |

L'import crea record in `draft` — un admin li completa e pubblica. Non pubblica automaticamente.

**Non si scrapa**: Film Commission regionali (HTML eterogeneo, fragile), broadcaster e piattaforme (accordi privati), investitori privati.

### Seed Iniziale (~30 bandi)

- MiC Sviluppo, MiC Produzione, MiC Distribuzione
- Creative Europe MEDIA Development, Production, Distribution
- Tax Credit Produzione (indipendenti, 40%)
- Eurimages Development Grant
- Film Commission: Puglia, Sardegna, Toscana, Piemonte, Emilia-Romagna
- Bando Italia-Francia 2026
- Torino Film Lab
- Biennale College Cinema

### Verifica Periodica

Job cron settimanale: porta a `expired` tutti i record `active` con `nextDeadline` passata. Genera task admin "Verificare se il bando è stato rinnovato".

Record `active` non verificati da >60 giorni: banner in UI "Dati non verificati di recente — consulta la fonte ufficiale" con link a `sourceUrl`.

---

## UI — Pagina `/projects/:id/funding`

### Struttura pagina

```
Header: "Bandi & Finanziamenti" + [+ Aggiungi reminder]

[Profilo di finanziamento — se incompleto: banner completeness]

Filtri: Tipo | Livello | Fase | Formato + filtri attivi come tag rimovibili

──────────────────────────────────────────────
✦ CONSIGLIATI PER "[Titolo Progetto]"
  Match AI: [genere] · [fase] · [regione]     [Come mai?]

  [card 91%] [card 87%] [card 74%]
──────────────────────────────────────────────

Tutti i bandi (34 risultati)     [Lista] [Griglia]

[riga bando]
[riga bando]
...
[Carica altri]
```

### Card Bando (lista)

```
Film Commission Toscana — Bando 2026              [♡ Salva]  [🔔]
🏛 Regionale · Bando pubblico                     ██░░░ 62%
💶 €10.000–€80.000   📅 Scade 30 giu 2026         compatibile
Fase: Sviluppo, Produzione · Formati: Feature, Corto
⚠ [eventuale requisito non soddisfatto]
                                         [Vedi dettaglio →]
```

Badge compatibilità: <50% grigio, 50–74% amber, ≥75% teal.

### Dettaglio Bando (sidebar destra)

- Score + barra visiva
- Sezione "Compatibilità con [Progetto]": lista ✓/~/✗ per ogni requisito
- Sezione "Requisiti candidatura": checklist con cosa è già disponibile in Oh Writers e cosa manca
- Tutti i dettagli del bando
- Link `sourceUrl` sempre prominente
- CTA: [Salva] [Imposta reminder] [Inizia candidatura — Prossimamente]

### Profilo di Finanziamento

Form compatto nella pagina (non modale): fase produttiva, budget stimato, regione, società di produzione (sì/no), co-produzione (sì/no), regista italiano (sì/no).

Completeness score visibile: "Completa il profilo per migliorare i match (3/6 campi)".

---

## Navigazione

Nuova voce nella sidebar del progetto, sotto una sezione "RISORSE" separata da "PROGETTO":

```
PROGETTO
  Overview
  Scaletta
  Sceneggiatura
  Schedule
  Breakdown
  Budget
  Locations

RISORSE
▶ Bandi & Finanziamenti
  Team
  Impostazioni
```

---

## Rischi e Mitigazioni

| Rischio | Mitigazione |
|---------|------------|
| Bandi scaduti non aggiornati | `lastVerifiedAt` + banner ≥60gg + `sourceUrl` sempre visibile + job cron auto-expire |
| Profilo incompleto → match impreciso | Warning contestuale invece di esclusione + completeness score |
| Troppo rumore notifiche | Soglia 70 + max 3 new_match/giorno per utente + preferenze configurabili |
| Dati errati da admin | Draft workflow + audit trail + `opportunity_updated` notifica agli utenti in watching |
| Match regionale sbagliato se co-produzione | `productionRegion` è array — match su intersezione |

---

## Punti di Estensione Futuri

- `otherRequirements: jsonb` — struttura machine-readable della domanda per pre-fill con Cesare
- `user_opportunity_interests.status` — tracker candidature (Watching / Applicato / Approvato / Rifiutato / Finanziato)
- `user_opportunity_interests.notes` — campo che Cesare potrà pre-compilare con bozza domanda
- API bearer token (già supportata da Better Auth) per integrazioni esterne

---

## Dipendenze

- Spec 30b — Centro Notifiche (le notifiche generate da questa spec richiedono la 30b)
- Spec 17 — Cesare (per spiegazione narrativa match e futuro pre-fill)
- `packages/domain` — nuovi tipi `FundingType`, `FundingLevel`, `ItalianRegion`, `InterestStatus`

---

## Roadmap

### Fase 1 — Catalogo + Match Statico (4–6 settimane)

- Schema DB: `funding_opportunities`, `project_funding_profile`, `user_opportunity_interests`
- Admin panel `/admin/opportunities`
- Seed ~30 bandi
- Pagina `/projects/:id/funding` con lista, filtri, card, sidebar dettaglio
- Form profilo di finanziamento
- Bottone "Segui questo bando"
- Nessuna notifica

**Deliverable**: un filmmaker compila 5 campi e vede 8 bandi ordinati per compatibilità.

### Fase 2 — Notifiche (→ Spec 30b, 3–4 settimane)

- Integrazione con centro notifiche
- Job cron: new_match + scadenze imminenti
- Auto-expire bandi scaduti

### Fase 3 — Semi-automazione + Cesare (4–6 settimane dopo Fase 2)

- RSS import MiC (draft auto-creato)
- Spiegazione narrativa match via Cesare (on-demand)
- Tracker candidature kanban
- Pre-fill bozza domanda con Cesare per MiC e Creative Europe

---

## Tests

| Tag | File | Scenario |
|-----|------|---------|
| OHW-300 | `tests/funding/funding-match.spec.ts` | Happy: progetto con profilo completo vede bandi ordinati per score |
| OHW-301 | `tests/funding/funding-match.spec.ts` | Sad: profilo incompleto → warning completeness, match parziale visibile |
| OHW-302 | `tests/funding/funding-match.spec.ts` | Hard gate: bando regionale Puglia non appare se regione = Toscana |
| OHW-303 | `tests/funding/funding-match.spec.ts` | Tax credit: appare sempre, stato "non disponibile" se no società di produzione |
| OHW-304 | `tests/funding/funding-interest.spec.ts` | Happy: utente salva bando → compare in "Seguiti" |
| OHW-305 | `tests/funding/funding-interest.spec.ts` | Happy: utente marca bando come "Applicato" → status aggiornato |
| OHW-306 | `tests/funding/funding-admin.spec.ts` | Happy: admin pubblica bando da draft → appare in lista utenti |
| OHW-307 | `tests/funding/funding-admin.spec.ts` | Sad: non-admin non accede a /admin/opportunities |
