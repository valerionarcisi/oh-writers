# Project Overview — Audit

Route: `apps/web/app/routes/_app.projects.$id.tsx` (la landing del singolo progetto).
Stato: pagina "lavagna piatta" — tutti i blocchi hanno lo stesso peso, le card produzione mostrano `—`, il team è un placeholder, manca qualunque idea di "next step".

## Findings (cosa non funziona)

1. **Header dispersivo**: 3 azioni terziarie (Frontespizio / Impostazioni / Archivia) hanno lo stesso peso visivo. Frontespizio è creativo, le altre due sono admin → vanno separate (azione primaria vs menu kebab).
2. **Progress "100%" è una bugia gentile**: conta solo l'esistenza dei doc (length > 0). Non distingue draft / rivisto / Cesare-checked. Metrica morta.
3. **Card Produzione vuote (`—`)**: il TODO in codice è onesto, ma una landing con tre card vuote dice "qui non c'è niente" anche quando il progetto ha 87 scene spogliate. Bisogna popolarle con dati reali (count + delta).
4. **Manca KPI di progetto**: pagine, scene, personaggi, location, durata stimata. Tutti dati che il server già ha (o calcola facilmente) e che servono per "leggere" il progetto in 2 secondi.
5. **Manca activity feed**: chi ha fatto cosa, quando. Specialmente importante con team. Oggi: zero traccia.
6. **Manca next step / Cesare**: il pattern controllore garbato esiste ovunque tranne qui. La overview è il luogo naturale: "Hai 87 scene, non hai mai aperto il breakdown — vuoi che generi una prima passata?"
7. **Team placeholder troppo grande**: una sezione intera per dire "in arrivo". Va rimossa o ridotta a riga collaborator (avatar + ruolo).
8. **Sceneggiatura sotto-rappresentata**: una riga di testo + bottone "Apri Editor". È il cuore del progetto, dovrebbe essere il blocco più ricco (ultima versione, pagine, scene, ultima modifica, draft color).
9. **Nessun senso di "dove sono nel processo"**: niente pipeline visiva soggetto → sinossi → trattamento → screenplay → breakdown → budget → schedule.

## Proposta di layout

```
[ HERO ]
  eyebrow mono: CORTOMETRAGGIO · COMMEDIA · PERSONALE · v3
  title (Fraunces): Non fa ridere
  primary CTA: Continua sceneggiatura  ·  kebab: Frontespizio / Impostazioni / Archivia

[ KPI STRIP ] (mono tabular)
  9 pagine · 12 scene · 4 personaggi · 3 location · ~9 min · ultima modifica 15 mag

[ PIPELINE BAR ] (Soggetto ✓ → Sinossi ✓ → Scaletta ✓ → Trattamento ✓ → Screenplay ● → Breakdown ○ → Budget ○ → Schedule ○)

[ CESARE NEXT STEP ] (banner non-bloccante, dismissable, mai chat)
  "Lo screenplay è fermo da 4 giorni e non hai ancora avviato lo spoglio. Vuoi che generi il breakdown?"

[ SEZIONI 2-col ]
  ─ MAIN (8/12) ────────────────  ─ SIDE (4/12) ──────────
  Narrative Development (4 card)   Activity feed
  Screenplay block ricco           Team / collaborators
  Production cards popolate
```

## Dati che servono dal server (query ipotetiche)

| Sezione         | Query                                                                          |
| --------------- | ------------------------------------------------------------------------------ |
| KPI strip       | `getProjectStats(projectId)` → `{ pageCount, sceneCount, characterCount, locationCount, estimatedMinutes, lastEditedAt }` |
| Pipeline        | già disponibile (`DOCUMENT_PIPELINE` + presence)                              |
| Breakdown card  | `getBreakdownSummary(projectId)` → `{ scenesBrokenDown, totalScenes, elementCount }` |
| Budget card     | `getBudgetSummary(projectId)` → `{ totalEUR, lineCount, lockedAt }`           |
| Schedule card   | `getScheduleSummary(projectId)` → `{ shootingDays, scheduledScenes, totalScenes }` |
| Activity feed   | `getProjectActivity(projectId, limit=10)` → eventi normalizzati (doc edit, screenplay save, breakdown change, comment, member added) |
| Cesare suggest  | `getProjectNextStep(projectId)` → euristica server-side (regole + LLM)        |

## Da rimuovere / spostare

- "Team — Presenza in tempo reale in arrivo": **rimuovere**. Sostituire con avatar stack discreto nell'header quando ci sono collaboratori; altrimenti niente.
- "Frontespizio / Impostazioni / Archivia" tutti come bottoni: **kebab menu**. L'unico bottone primary è "Continua sceneggiatura".
- ProgressBar generica "Sviluppo narrativo 100%": **rimuovere**. Sostituita dalla pipeline bar con stato per nodo (vuoto / draft / completo).
- "Aggiornata 15 mag" come testo nudo: **spostare** dentro KPI strip e dentro screenplay block come metadata mono.
