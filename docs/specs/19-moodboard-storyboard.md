# Spec 19 — Moodboard / Storyboard (Placeholder)

> **Stato: PLACEHOLDER.** Questa spec è un segnaposto. **Non iniziare implementazione** finché non è stata fatta una brainstorming session dedicata e il documento è stato promosso da "Placeholder" a "Approved".

## Intent (bozza, non binding)

Uno strumento **visivo** a complemento della scaletta (Spec 04b) e del trattamento (Spec 04). L'idea è permettere allo sceneggiatore di affiancare al testo:

- **Moodboard**: una galleria di immagini di riferimento per il tone-of-voice (stile foto, atmosfere, color palette, location references, casting references)
- **Storyboard / timeline visuale**: una rappresentazione sequenziale delle scene (magari derivata da outline) con un'immagine per scena, creando una linea narrativa per lettura visiva rapida

## Perché è separato da Spec 04c

Spec 04c (narrative export) ha scope stretto: generare un **PDF testuale** del pitch narrativo (logline + sinossi + trattamento) da condividere con produttori e agenti. È un output documentale per stakeholder esterni.

Questa spec è un **tool creativo interno** per lo sceneggiatore. Obiettivi diversi, utenti primari diversi, tecnologie diverse, cicli di iterazione diversi. Mischiarli in una spec unica produrrebbe sia un export povero sia un moodboard incompleto.

## Questioni aperte da risolvere prima della spec vera

### Fonte delle immagini

- **A)** Generazione AI (DALL·E, Stable Diffusion, Imagen)
  - Pro: nessun upload utente, coerenza estetica, iterazione rapida su prompt
  - Contro: costo API, latenza, concerns di ownership/training, possibile drift stilistico
- **B)** Upload utente (file locali, drag-and-drop)
  - Pro: nessun costo AI, copyright chiaro, zero dipendenze esterne
  - Contro: workflow più lento, utente deve trovare le immagini
- **C)** Stock API (Unsplash, Pexels, Pixabay)
  - Pro: librerie enormi, gratuite/freemium, copyright pulito
  - Contro: ricerca testuale limitata, risultati generici, dipendenza da terze parti
- **D)** Ibrido (tutte le sopra)
  - Pro: flessibilità massima
  - Contro: UX complicata, difficile da far quadrare in v1

### Video

- Moodboard supporta video? Se sì, generati (costosissimi — Sora, Runway, Kling) o caricati / linkati (YouTube, Vimeo)?
- v1 suggerito: **solo immagini statiche**. Video in v2.

### Granularità / aggancio ai dati

- **Moodboard a livello progetto** (una sola board globale)
- **Moodboard per atto/sequenza/scena** (figli della gerarchia outline)
- **Moodboard come documento autonomo** (separato dall'outline)

### Layout

- **Griglia** (Pinterest-style, masonry)
- **Timeline orizzontale** (scene in ordine, scrollabile)
- **Linked** (ogni immagine punta a una sezione del trattamento o a una scena outline)

### Storage immagini

- Inline base64 in DB (orribile per immagini grandi, ok solo per placeholder)
- Object storage (GCP Cloud Storage, S3) — preferibile
- CDN davanti? (Cloudflare, Bunny) — probabilmente sì
- Limiti: dimensione per immagine, numero per progetto, retention

### Permessi / collaborazione

- Owner e editor possono aggiungere/rimuovere
- Viewer solo visualizza
- Moodboard è condivisibile al di fuori del team? (link pubblico read-only?) → prob no in v1

### Export

- Moodboard esportabile in PDF separato? Concatenato all'export narrativo (Spec 04c)?
- Pitch package (v2?) = narrative export + moodboard combinati?

## Out of scope esplicito (da tenere anche nella spec vera, probabilmente)

- **Video editing** (timeline con tagli, transizioni) — non siamo una DAW video
- **AI scriptwriting basato su moodboard** — troppo speculativo, v3+
- **Real-time collaboration sul moodboard** (Yjs sulle immagini) — complesso, rimandato
- **Annotazioni / commenti sulle immagini** — sub-spec

## Prossimi step

1. **Brainstorm session dedicata** con la skill `brainstorming` — rispondere alle questioni aperte sopra
2. **Design mockup** (Figma o sketch) del layout scelto
3. **Decisione tech stack**: AI provider, storage, libreria image manipulation (se serve)
4. **Promozione della spec** da placeholder ad approved

## Files (quando implementata)

Da definire. Probabilmente:

```
packages/db/src/schema/moodboard.ts            ← NEW, boards + board_items tables
apps/web/app/features/moodboard/               ← NEW feature folder intero
```

## Note

- Numero spec **19** scelto per stare fuori dai cluster esistenti (04/05 = narrative, 10/11/12 = breakdown/budget/schedule). 17 e 20+ sono liberi se 19 si rivela confusivo — rinumerabile.
