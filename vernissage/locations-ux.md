# Vernissage — Location UX completa

- **Spec**: `docs/specs/29-cesare-ui.md` § Locations UX (modal, lightbox, area search)
- **Story**: `vernissage/_stories/locations-ux.story.json`
- **Spec E2E (mock-ui)**: `tests/cesare-agentic-locations-ux.spec.ts` (`[OHW-585]`, `[OHW-586]`, `[OHW-587]`)
- **Mock scenario**: nessuno — la ricerca area è stubbata via `page.route()` sull'endpoint Google Places `searchNearby`. Il flusso modal/lightbox usa fotos seedate (`SEEDED_LOCATION_CANDIDATE_1_ID`).
- **Branch**: `agent-e-locations-ux`
- **Target**: `dev`

## Cosa è cambiato

- Nuovo `LocationDetailModal` (Dialog react-aria) come sostituto del "Vedi dettagli" del popup Leaflet: foto in griglia 3-colonne, sezione contatto editabile, "Centra sulla mappa" come azione primaria, link Google Maps secondario, footer con Scarta / Segna visitata / Conferma.
- Nuovo `PhotoLightbox` full-screen con `useDialog` + `useOverlay`, navigazione tastiera (←/→), ESC, click sullo scrim per chiudere, contatore "N / M".
- Nuovo `AreaSearchPanel` (TripAdvisor-style): si attiva al `drawcreated` con `circle`, espone input query opzionale e bottone "Cerca", lista risultati con thumbnail/indirizzo, select di requisito target e "Aggiungi candidato" → riusa `addLocationCandidate`.
- Nuova server fn `searchPlacesInArea` su `places-autocomplete.server.ts` (Google Places `searchNearby` con fallback `searchText` quando l'utente passa una query libera). Validation Zod su `lat/lng/radius_m`.
- Pin "found places" sulla mappa (anello blu, popup "+ Aggiungi come candidato").
- System prompt Cesare aggiornato per ribadire che `add_candidate` è l'azione che salva un candidato proposto.
- Seed esteso: candidato 1 ora ha `lat/lng` e due foto placeholder per esercitare la galleria nei test.

## Screenshot del walk

![Step 1 — requirement attivo](screenshots/01-requirement-selected.png)
![Step 2 — modal aperto con foto](screenshots/02-detail-modal-open.png)
![Step 3 — lightbox full-screen](screenshots/03-photo-lightbox.png)
![Step 4 — area-search panel](screenshots/04-area-search-panel.png)

## Verifica manuale (Valerio)

- [ ] `/projects/<id>/locations` carica la mappa con i pin esistenti
- [ ] Click su pin → popup → "Vedi dettagli" → modal con foto, indirizzo, contatto, AI reasoning
- [ ] Click foto in modal → lightbox full-screen, ESC chiude, ← / → navigano
- [ ] Disegno cerchio (toolbar Leaflet, top-right) → appare `AreaSearchPanel` ancorato in alto a sinistra
- [ ] "Cerca" senza testo → risultati Places nearby; con testo → risultati filtrati
- [ ] "+ Aggiungi" su un risultato → nuovo candidato in DB, refetch automatico, card visibile nel panel
- [ ] Test `[OHW-585]`, `[OHW-586]`, `[OHW-587]` verdi con `pnpm test --project=mock-ui`

## Risultato walk script

- Step eseguiti: 4 screenshot, eventi sintetici per skip della UI Leaflet asincrona
- Fallimenti: TBD (al primo run)

## Note

La ricerca area è stubbata in test perché l'endpoint Google Places richiede una chiave reale; in produzione il flow è coperto dalla manual checklist sopra. La security TODO sull'API key inline negli URL delle foto resta aperta e va indirizzata da una endpoint proxy separato (fuori scope).
