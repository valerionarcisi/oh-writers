# Dashboard progetti — Audit & proposta

Route: `/dashboard` (`_app.dashboard.tsx`). Server fn: `listPersonalProjects`.

## Findings (stato attuale)

1. **Card progetto povera**: solo titolo, format/genre, "Aggiornato il …". Mancano segnali che lo sceneggiatore usa ogni giorno per scegliere su quale progetto tornare.
2. **Una card per riga**: spreca lo spazio orizzontale di un laptop 13" o di un monitor desktop. A 5 progetti la pagina è già scrollabile inutilmente.
3. **Nessuna vista lista densa**: chi cura 8–15 progetti non ha modo di vederli tutti in un colpo d'occhio.
4. **Tab statici (Tutti / Personali / Archiviati)**: manca "Condivisi con me" (team) e nessun conteggio per tab.
5. **Nessun filtro per formato / genere / ruolo**: l'unico filtro è la ricerca testuale + sort per data.
6. **Empty state generico**: solo testo "Nessun progetto" — non comunica cosa fa il prodotto al primo accesso.
7. **Nessun KPI globale**: l'utente non vede "3 progetti attivi · 142 scene · 18 giornate pianificate" — info che esistono già lato server.
8. **Nessun pinning / recenti**: aprire l'app non porta automaticamente al "progetto su cui stavo lavorando ieri".

## Proposta layout

- **Hero strip mono** (allineato a `viewbar` di Budget/Schedule): conteggi globali in tipografia Courier — `PROGETTI 4 · SCENE TOTALI 142 · GIORNATE 18 · ULTIMA MODIFICA 15 MAG`.
- **Viewbar tabline**: `Tutti (4) · Personali (3) · Condivisi (1) · Archiviati (2)` mono uppercase 12px, sottolineatura attiva.
- **Toolbar destra**: search · filtri (formato, genere, ruolo) · sort · switch **list / grid**.
- **Sezione "Continua da dove eri"** (max 2 card) con thumbnail + last-edit deeplink alla pagina/scena.
- **Card progetto ricca** (grid): titolo Fraunces, riga mono `CORTO · COMMEDIA · IT`, KPI inline (scene, pagine, %completion, prossima deadline), avatar collaboratori, badge ruolo, ultima attività umana ("Maria ha modificato la scena 12, 2h fa").
- **Vista list** (densa): riga tipo tabella editoriale con colonne `Titolo · Formato · Scene · % · Ultima modifica · Collaboratori`.
- **Variante B "library"**: ogni progetto come "libro" su scaffale (copertina Fraunces sul dorso, etichetta mono), tono editoriale.

## Dati da aggiungere alla card (server fn già esistenti o estensione minima)

- `screenplay.sceneCount` — derivabile da `screenplays.content` (parser fountain già presente) o cached column da aggiungere.
- `screenplay.pageCount` — già stimato altrove (vedi `cost-estimate`).
- `completion%` — % documenti compilati su `DocumentTypes` (logline/synopsis/outline/treatment/screenplay). `listPersonalProjects` da estendere con join su `documents`.
- `lastActivity` — `updatedAt` già presente; aggiungere `lastEditor` (userId + name) da `activity_log` o `documents.updatedBy`.
- `collaborators` — query su `team_members` quando `teamId != null`.
- `role` — derivato da `ownerId === userId` o `team_members.role`.
- `nextDeadline` — opzionale, da `schedule.shootingDays[0]`.

> Cambio API suggerito: nuovo `listDashboardProjects` che ritorna `Project & { sceneCount, completion, lastEditor, collaborators[], role }` — un solo round-trip invece di N+1.

## Empty state + CTA

- Illustrazione typewriter mono (ASCII art) + heading Fraunces "Pagina bianca".
- Sottotitolo: "Inizia da una logline, importa un Fountain, o parti da un template."
- 3 CTA affiancate: **Nuovo progetto** (primario), **Importa Fountain**, **Template** (cortometraggio, serie, lungo).
- Secondary link: "Guarda un esempio" → progetto demo read-only.

## Accessibilità

- Viewbar tab `role="tablist"`, frecce ←→ per navigare.
- Card progetto `<article>` con `<a>` wrappante; KPI con `aria-label` parlante ("12 scene su 24 stimate").
- Switch list/grid `<button aria-pressed>`, persistito in `localStorage`.
- Reduced-motion: niente hover-lift sulle card.
