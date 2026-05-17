# 13b — Locations Manager UX Mockup

Reference spec: `13-locations.md`

---

## Layout overview

Same shell as Breakdown / Budget / Schedule: viewbar at top, split layout below.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  VERSIONI ∨    [Lista]  [Mappa]                            Esporta PDF  …   │  ← viewbar
├────────────────────────┬────────────────────────────────────────────────────┤
│  LOCATION (12)         │                                                    │
│  ─────────────────     │   APPARTAMENTO DI MARCO                            │
│  Filtri: Tutti ∨       │   ─────────────────────────────────────────────── │
│                        │   INT · GIORNO, SERA                               │
│  ● APP. MARCO     [3]  │   6 scene · SC.1, SC.3, SC.7, SC.12, SC.18, SC.24 │
│  ● CORRIDOIO      [1]  │                                                    │
│  ○ TETTO NOTTE    [2]  │   CANDIDATI                                        │
│  ○ STRADA EXTRA   [4]  │   ┌───────────────────────────────────────────┐   │
│  ○ FABBRICA ABB.  [2]  │   │ ★  Via Tortona 18 · Milano        VISIT. │   │
│  ○ EXT. BOSCO     [5]  │   │    Contatto: Lucia Ferrara                │   │
│  …                     │   │    €350 / giorno · Permesso: sì           │   │
│                        │   │    ████████░░  3 foto                     │   │
│                        │   └───────────────────────────────────────────┘   │
│                        │   ┌───────────────────────────────────────────┐   │
│                        │   │    Largo Argentina 8 · Roma       CANDID. │   │
│                        │   │    Nessun contatto                        │   │
│                        │   │    — / giorno · Permesso: ?               │   │
│                        │   │    ░░░░░░░░░░  0 foto                     │   │
│                        │   └───────────────────────────────────────────┘   │
│                        │                                                    │
│                        │   [+ Aggiungi candidato]  [✦ Suggerisci con AI]   │
│                        │                                                    │
│                        │   ──────────────────────────────────────────────  │
│                        │   CONFERMA LOCATION                               │
│                        │   Via Tortona è selezionata come candidata.       │
│                        │   [Conferma Via Tortona 18]                       │
└────────────────────────┴────────────────────────────────────────────────────┘
```

Legend in sidebar:
- `●` = confirmed (green dot)
- `○` = pending/scouting (grey dot)
- `[N]` = number of scenes

---

## Sidebar — requirements list

```
┌────────────────────────┐
│  LOCATION (12)         │
│  ─────────────────     │
│  Filtri: [Tutte ∨]     │
│                        │
│  ● APP. DI MARCO    3  │  ← confirmed, green
│  ● CORRIDOIO COND.  1  │  ← confirmed, green
│  ◑ TETTO DI NOTTE   2  │  ← scouting in progress, amber
│  ○ STRADA EXTRAURB. 4  │  ← pending, grey
│  ○ FABBRICA ABBAND. 2  │  ← pending, grey
│  ○ EXT. BOSCO       5  │
│  ○ OSPEDALE INT.    3  │
│  ○ AUTO IN MOVIMENTO 2 │
│  ○ STAZIONE METRO   1  │
│  ○ UFFICIO APERTO   4  │
│  ○ PORTO CONTAINER  3  │
│  ○ VILLA CON PISCIN. 1 │
│                        │
│  ──────────────────    │
│  Conferm.  2/12  16%   │
│  ██░░░░░░░░░░          │
└────────────────────────┘
```

Filter chip row:
```
[Tutte]  [Da fare]  [In sopralluogo]  [Confermate]
```

---

## Detail panel — requirement + candidates

```
┌────────────────────────────────────────────────────────────────────────────┐
│  APPARTAMENTO DI MARCO                                                      │
│  INT · GIORNO, SERA  ·  6 scene                                            │
│  SC.1, SC.3, SC.7, SC.12, SC.18, SC.24   [vedi nel breakdown →]           │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CANDIDATI                                                    [+ Aggiungi] │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ★  Via Tortona 18, Milano                           VISITATA  [⋮]  │   │
│  │                                                                     │   │
│  │  📍 Via Tortona 18, 20144 Milano   [apri mappa →]                  │   │
│  │  👤 Lucia Ferrara  ·  lucia@studio.it  ·  +39 02 1234567           │   │
│  │  💶 €350 / giorno                                                   │   │
│  │  📋 Permesso necessario — SIAE + Comune. Contattare uff. cultura.   │   │
│  │  📅 Disponibile: 15 giu – 30 lug 2026                              │   │
│  │                                                                     │   │
│  │  NOTE                                                               │   │
│  │  Spazio ampio, ottima luce naturale. Piano -1 con finestre su       │   │
│  │  cortile. Rumore da strada nelle ore di punta (evitare 8-10).       │   │
│  │                                                                     │   │
│  │  FOTO (3)                                                           │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                              │   │
│  │  │  📷  │ │  📷  │ │  📷  │ │  ➕  │                              │   │
│  │  │soggi.│ │cucina│ │ingr. │ │      │                              │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘                              │   │
│  │                                                                     │   │
│  │                             [Conferma come location definitiva →]   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ○  Largo Argentina 8, Roma                          CANDIDATA [⋮]  │   │
│  │  Nessun contatto · — / giorno · Permesso: ?                        │   │
│  │  0 foto  ·  [Aggiungi dettagli →]                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [+ Aggiungi candidato manualmente]   [✦ Suggerisci con AI]               │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## AI suggestion panel (appears inline after clicking "Suggerisci con AI")

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ✦ Suggerimenti AI per "APPARTAMENTO DI MARCO"                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Basato su: INT, giorno/sera, Milano, drama contemporaneo                   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  1.  Navigli / Porta Genova (Milano)                    conf. 0.88   │ │
│  │      Appartamenti d'epoca con interni caratteristici. Zona ricercata  │ │
│  │      per produzioni italiane contemporanee. Affitti in media €300-500.│ │
│  │      🔍 "location appartamento Navigli Milano affitto cinema"         │ │
│  │                                           [+ Aggiungi come candidato] │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  2.  Prati / Trastevere (Roma)                          conf. 0.71   │ │
│  │      Adatti per produz. che non richiede ambientazione esplicit.      │ │
│  │      Milano. Disponibilità maggiore e costi inferiori.                │ │
│  │      🔍 "appartamento Trastevere affitto riprese cinema"              │ │
│  │                                           [+ Aggiungi come candidato] │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  3.  Studio set costruito (qualsiasi città)             conf. 0.60   │ │
│  │      Massimo controllo su luce e suono. Costo superiore ma zero      │ │
│  │      problemi di permesso. Adatto se scene richiedono modifiche.     │ │
│  │      🔍 "studio cinematografico affitto set Milano"                   │ │
│  │                                           [+ Aggiungi come candidato] │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [Chiudi]                                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Map view (tab "Mappa")

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  VERSIONI ∨    [Lista]  [Mappa]                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                                                                      │  │
│  │            ⬤ APP. MARCO (conferm.)                                   │  │
│  │                                                                      │  │
│  │     ○ FABBRICA (candidata)                 ⬤ UFFICIO (conferm.)     │  │
│  │                                                                      │  │
│  │                        ○ STAZIONE METRO                              │  │
│  │                                                                      │  │
│  │  [mappa interattiva — Mapbox o simile]                               │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ⬤ Confermate (2)   ○ Candidate (8)   ✕ Senza coordinate (2)              │
│                                                                             │
│  CLUSTER GIORNATE RIPRESA                                                   │
│  ┌────────────────────┐  ┌────────────────────┐                           │
│  │ Zona Nord Milano   │  │ Roma Centro        │                           │
│  │ 3 location · 8 sc. │  │ 2 location · 5 sc. │                           │
│  │ ~4 giornate        │  │ ~2 giornate        │                           │
│  └────────────────────┘  └────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Add candidate form (inline drawer or modal)

```
┌────────────────────────────────────────────────┐
│  Aggiungi candidato                       [✕]  │
│  ────────────────────────────────────────────  │
│                                                │
│  Nome del posto *                              │
│  ┌──────────────────────────────────────────┐ │
│  │ Es. Villa Borghese, Roma                 │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  Indirizzo                                     │
│  ┌──────────────────────────────────────────┐ │
│  │                                          │ │
│  └──────────────────────────────────────────┘ │
│  [📍 Cerca su mappa]                           │
│                                                │
│  Contatto                                      │
│  Nome  ┌───────────────┐  Tel ┌─────────────┐ │
│        └───────────────┘      └─────────────┘ │
│  Email ┌──────────────────────────────────┐   │
│        └──────────────────────────────────┘   │
│                                                │
│  Costo giornaliero (€)  ┌──────┐              │
│                         └──────┘              │
│                                                │
│  Permesso necessario?  ○ Sì  ○ No  ○ Da verif.│
│                                                │
│  Note                                          │
│  ┌──────────────────────────────────────────┐ │
│  │                                          │ │
│  │                                          │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  [Annulla]              [Aggiungi candidato →] │
└────────────────────────────────────────────────┘
```

---

## Status chips / visual indicators

| Status requirement | Color | Icon |
|--------------------|-------|------|
| `pending`          | grey  | `○`  |
| `scouting`         | amber | `◑`  |
| `confirmed`        | green | `●`  |
| `locked`           | teal  | `🔒` |

| Status candidate | Badge |
|------------------|-------|
| `candidate`      | `CANDIDATA` (grey pill) |
| `visited`        | `VISITATA` (blue pill)  |
| `rejected`       | `RIFIUTATA` (red pill, strikethrough row) |
| `confirmed`      | `★ CONFERMATA` (green pill, prominent) |

---

## Integration touchpoints

- **Breakdown tab** — each scene row shows confirmed location badge; clicking goes to locations manager
- **Schedule strip board** — scenes grouped by `confirmedCandidateId`; location name shown as group header
- **Budget** — confirmed candidate's `estimatedDailyFee` populates the "Locations" budget line automatically
- **Cesare** — can answer "quali location non sono ancora confermate?" and suggest candidates based on screenplay content

---

## Open questions (for design session)

1. Map provider: Mapbox (needs API key + cost) vs Leaflet + OpenStreetMap (free, less polished)?
2. Photo storage: direct S3/GCS upload or via a resizing service?
3. Mobile companion: location scouting is a strong mobile use case — scout on-site with camera. Should the companion app allow photo uploads from this module specifically?
4. Sharing: export a PDF "location dossier" per requirement (photos + contacts + notes) for the AD?
