# Deep app audit — AI reale — 2026-06-02

Audit live di tutta l'app con **AI reale** (`MOCK_AI=false`, key Anthropic vera),
loggato come `valerio@ohwriters.dev`. Stack: web :3000, ws-server :1234, postgres+redis,
DB `oh-writers_dev` reseedato pulito. Driver: playwright-cli.

Severità: **ALTO** (blocca/rompe un flusso) · **MEDIO** (degrada UX / funziona col workaround) · **BASSO** (cosmetico/nice-to-have).

---

## Sommario esecutivo

**Cosa VA (verificato live):** Cesare con **AI reale** funziona end-to-end (agentic edit sul
Soggetto: tracer live → result card "5 passaggi · Aggiornato Soggetto · Mostra modifiche");
spoglio breakdown con AI reale; scrittura sceneggiatura → autosave → reload **persiste**; tutte
le pagine feature caricano senza crash (overview, soggetto/sinossi/scaletta/trattamento,
breakdown 3-viste, budget, schedule, locations, opportunities, frontespizio, settings,
shooting-plan, versioni, sessioni Cesare); i18n switch IT↔EN + **EN-gating** (opportunities
nascosto in EN) OK; SegmentedControl radio (spec 25b) switch deterministico.

**Cosa NON va (prioritizzato):**

| # | Sev | Problema | Fix |
|---|-----|----------|-----|
| ALTO-1 | 🔴 | Root loader crasha su OGNI navigazione client (`resolveLocale` chiama `getWebRequest()` server-only) — l'app SPA è di fatto rotta, solo i full-reload funzionano | Wrappare `resolveLocale` in `createServerFn` |
| MEDIO-2 | 🟠 | Manca "↩ Annulla" sulla result card Cesare (contratto Agentic Edit) | Aggiungere undo/revert inline |
| MEDIO-5 | 🟠 | Seed: editor sceneggiatura mostra "1/1" vuoto pur con 9 scene seedate (write reale persiste — è solo il seed) | Seed popola `pm_doc` coerente con `scenes` |
| MEDIO-8 | 🟠 | Dialog conferma (ri-spoglio / genera budget) senza testo (titolo/descrizione vuoti) | Rendere il corpo del ConfirmDialog |
| MEDIO-9 | 🟠 | i18n leak: pagina "Versioni sceneggiatura" tutta in inglese | Estrarre stringhe in `t()` |
| BASSO-3 | 🟡 | Cesare: Enter va a capo invece di inviare (solo ↑ invia) | Enter invia, Shift+Enter newline |
| BASSO-4 | 🟡 | Doppio affordance "Apri Cesare" vs dock confondente | Chiarire trigger primario |
| BASSO-6 | 🟡 | Doc drift: CLAUDE.md dice Monaco, l'editor è ProseMirror | Aggiornare doc |
| BASSO-7 | 🟡 | Stima budget dà 0€ senza spiegare "conferma prima gli elementi" | Messaggio guida |

**Raccomandazione:** ALTO-1 va fixato per primo e da solo — rende l'app navigabile. Gli altri
sono raggruppabili (i18n leak + dialog vuoto + undo Cesare = un giro UX).

---

## 🔴 ALTO-1 — Crash del root loader su OGNI navigazione client-side (`resolveLocale` chiama codice server-only)

**Sintomo:** dalla dashboard, cliccare un progetto (o qualsiasi link in-app) mostra una
schermata d'errore: `Something went wrong! Cannot read properties of undefined (reading 'config')`.
Il **full reload (SSR) funziona** — solo la navigazione client interna crasha. Riproducibile 100%.

**Repro:**
1. Login → /dashboard (full load, OK).
2. Click su una card progetto (`a[href="/projects/<id>"]`) → CRASH.

**Causa (`apps/web/app/routes/__root.tsx:29-32` + `apps/web/app/features/i18n/resolve-locale.server.ts:25-34`):**
il root `loader` chiama direttamente `resolveLocale()`, che usa `getWebRequest()` da
`@tanstack/start/server` (server-only). TanStack Start **ri-esegue i loader anche sul client**
durante le navigazioni in-app; sul client `getWebRequest()` non ha l'async-context server →
`undefined.config` → l'eccezione sale fino al `CatchBoundary` del root e rimpiazza l'intera pagina.

Stack osservato:
```
TypeError: Cannot read properties of undefined (reading 'config')
  at @tanstack_start_server.js:19740
  at resolveLocale (resolve-locale.server.ts:15)   // getWebRequest()
  at Object.loader (__root.tsx:46)
```

**Perché è ALTO:** rende l'app inutilizzabile con la navigazione normale (SPA). Ogni click
interno rompe. Finora mascherato perché i test E2E e gli audit precedenti spesso fanno `goto`
(full load) invece di click in-app; l'agent A2 (spec 09b ph2) aveva intravisto questo stesso
`config TypeError` come "transitorio" — in realtà è deterministico su client nav.

**Fix proposto:** `resolveLocale` deve girare SOLO server-side. Wrapparlo in un
`createServerFn` (regola hard del progetto: "server calls go through createServerFn only") così
sul client il loader fa una RPC al server invece di invocare `getWebRequest()` direttamente.
Il loader del root chiama la server fn; SSR e client passano entrambi dal server. Da verificare
che `<html lang>` resti coerente (è già risolto server-side, quindi nessun flip).

---

## ✅ PASS — Cesare AI reale sul Soggetto (agentic edit + tracer)

Richiesta reale ("rendi più incisivo l'incipit") → Cesare ha eseguito end-to-end con
**AI vera**: tracer live `STO SCRIVENDO Soggetto` durante lo streaming, poi result card
**"5 passaggi ▾ · Aggiornato Soggetto · 1 MODIFICA · Mostra modifiche"** — il pattern
Notion inline-trace canonico. "Mostra modifiche" apre il diff (3 add/del marks). Editor
aggiornato live dietro la chat. Invariante tracer rispettata (writing→done→result card).
Screenshot: `/tmp/audit-03-cesare-soggetto.png`.

## 🟠 MEDIO-2 — Manca il bottone "↩ Annulla" sulla result card di Cesare

Il pattern Agentic Edit canonico (CLAUDE.md §Agentic Edit Pattern punto 4) richiede su ogni
result card **"Mostra/Nascondi modifiche" + "↩ Annulla"** (revert della mutazione, con versione
auto-creata prima dell'edit). Osservato: "Mostra/Nascondi modifiche" c'è, **"↩ Annulla" NO**
(nessun bottone annulla/revert/undo trovato sulla card). Da verificare se la versione è
auto-creata (revert ancora possibile via drawer Versioni) — ma l'undo inline manca, è parte
del contratto di prodotto. file: `packages/ui/src/composites/ChangeTrace/*` + la result card di Cesare.

## 🟡 BASSO-3 — Invio Cesare: Enter inserisce newline invece di inviare

Nella textarea "Chiedi a Cesare…", premere **Enter** aggiunge un a-capo invece di inviare;
l'invio funziona solo col bottone **↑**. Per una chat è atteso che Enter invii (Shift+Enter =
newline). Da valutare se è scelta voluta; se no, è frizione UX. file: input di `CesareDrawer`.

## 🟡 BASSO-4 — "Apri Cesare" (margin-note) vs dock: doppio affordance confondente

C'erano due affordance "Cesare": il bottone dock e una "Apri Cesare" legata alle margin-note,
con stati che riportavano `drawerOpen:true` mentre `data-cesare="closed"`. Solo dopo il click
sul giusto trigger `data-cesare` è passato a `expanded`. Possibile confusione di discoverability
su quale apre la chat. Da verificare quale sia il trigger primario inteso.

## 🟠 MEDIO-5 — Seed inconsistente: l'editor sceneggiatura mostra "1/1" vuoto pur avendo 9 scene seedate

**Sintomo:** aprendo `/projects/<id>/screenplay` su uno screenplay seedato (Test User,
progetti `…010`/`…011`), l'editor ProseMirror è vuoto (`.ProseMirror` innerText = "⋮"), la
viewbar dice **"Indice 1/1"** e i KPI **"SCENE 1 · PAGINE 1"** — invece delle **9 scene**
presenti in tabella `scenes`. Riproducibile con e senza WS.

**Causa (probabile, da confermare):** disallineamento seed/loader. Nel DB lo screenplay ha
`scenes` = 9 righe, ma `pm_doc` ≈ 194 char (doc PM vuoto/minimo) e `content` ≈ whitespace.
L'editor monta dal `pm_doc`/`content` (vuoto) e NON aggrega le 9 righe `scenes`. Quindi o il
seed popola `scenes` ma non `pm_doc`/`content` coerente, o il loader non ricostruisce il doc
dalle scene. In entrambi i casi **l'utente vede una sceneggiatura vuota dove dovrebbe esserci
il suo lavoro** → esperienza rotta sul flusso centrale del prodotto.

**ESITO TEST (fatto):** scritto "INT. TEST AUDIT - GIORNO" → autosave → reload → **persiste**.
Quindi loader+save del contenuto utente FUNZIONANO. Il problema è **solo il seed**: popola la
tabella `scenes` (9) ma lascia `pm_doc`≈194b e `content`≈whitespace, e l'editor monta dal
`pm_doc` (vuoto), non aggrega `scenes`. Impatto reale: **i progetti demo/seedati appaiono con
sceneggiatura vuota** (cattiva prima impressione), ma il flusso di scrittura reale è sano.
Fix: il seed deve popolare `pm_doc`/`content` coerenti con le `scenes`, oppure il loader deve
ricostruire il doc dalle `scenes` quando `pm_doc` è vuoto.

Screenshot: `/tmp/audit-05-screenplay-content.png`, `/tmp/audit-06-screenplay-empty.png`.

## 🟡 BASSO-6 — Doc drift: lo Stack in CLAUDE.md dice "Monaco (screenplay editing)" ma l'editor è ProseMirror

L'editor sceneggiatura è ProseMirror (`.ProseMirror`), non Monaco. La tabella Stack in
CLAUDE.md elenca "Editor | Monaco (screenplay editing)". Aggiornare la doc (o confermare la
strategia editor: memoria `project_editor_strategy` dice Monaco desktop / CodeMirror mobile,
ma l'implementazione live è PM). Doc-vs-realtà.

## ✅ PASS — Breakdown (viste + spoglio AI reale)

`/breakdown` carica senza crash, mostra le 3 viste via SegmentedControl (Per scena / Per
progetto / Matrice — i radio migrati in spec 25b funzionano, switch deterministico). La scena
scritta a mano ("SC. 1 INT. TEST AUDIT — GIORNO") appare con "€ 2860/giornata · Aggiungi al
budget". Vista Matrice ha un empty state corretto. **"Ri-spogliare con AI"** apre un dialog di
conferma (Genera/Annulla) e, confermato, lancia lo spoglio con **AI reale** → genera elementi
ghost senza crash. Screenshot: `/tmp/audit-07-breakdown.png`, `/tmp/audit-08-breakdown-matrix.png`,
`/tmp/audit-09-breakdown-spoglio-ai.png`.

## ✅/🟡 Budget — carica e stima parte, ma 0€ senza elementi confermati

`/budget` carica senza crash, viste Panoramica/Per categoria/Per giornata/Settimane, tetto
budget, categorie Cast/Troupe. "Genera" lancia la stima **AI reale** (conferma via dialog →
chiamata parte, no crash) ma il TOTALE resta **0 €**: coerente con 0 elementi breakdown
**confermati** (sul progetto avevo solo ghost non accettati → niente da stimare).
**BASSO-7:** quando non ci sono elementi confermati la stima dà 0€ **senza spiegare il perché**
all'utente (nessun messaggio "conferma prima gli elementi del breakdown"). UX da chiarire.
Screenshot: `/tmp/audit-10-budget.png`, `/tmp/audit-11-budget-ai.png`.

## 🔴→✅ ALTO-8 (CORRETTO) — Il CTA "Ri-spogliare con AI" era un NO-OP (TODO non wired)

**Rettifica:** in audit avevo letto un "dialog vuoto" — era una mis-osservazione (bottoni di
overlay sovrapposti). Indagando il codice ho trovato il bug vero, **più grave**: il pulsante
primario del breakdown **"Ri-spogliare con AI"** aveva `onClick: () => { /* TODO wire */ }`
→ **non faceva NULLA**. Lo spoglio AI che sembrava funzionare in audit veniva dall'auto-spoglio
on-mount, non dal bottone. (Il budget "Genera" invece È wired correttamente.)
**FIX (fatto):** il CTA ora chiama `useStreamFullSpoglio(versionId).mutate({force:true})` dietro
un ConfirmDialog (`breakdown.respoglio.*`, en/it), con banner di progresso + invalidazione query.
file: `BreakdownPage.tsx` + `breakdown.ts` keys.

## ✅ PASS — Pagine secondarie (full-load): schedule, locations, opportunities, title-page, settings, shooting-plan, sessioni Cesare, versioni

Tutte caricano senza crash con contenuto reale: Calendarizzazione (Spannografo/Giornata/
Settimane), Location (filtri + empty state), Opportunities (Bandi/Festival/Grant), Frontespizio,
Impostazioni progetto, Inquadrature/Piano di ripresa, Sessioni Cesare ("le tue conversazioni").

## ✅ PASS — i18n: switch IT↔EN + EN-gating

Settings utente ha il SegmentedControl IT/EN (radio migrato). Switch a EN → `<html lang>` = "en".
**EN-gating OK:** in EN `/opportunities` **redirecta** alla overview (la feature IT-market bandi
è nascosta nel mercato internazionale, come da spec feature-flags). 

## 🟠 MEDIO-9 — i18n leak: la pagina "Versioni sceneggiatura" è in inglese

`/screenplay/versions` mostra **"Back to Editor", "Versions", "Save version", "Restore",
"Delete", "1 page"** in inglese mentre `<html lang="it">` e l'utente è IT. La rollout i18n
(PR #21–30) non ha coperto questa surface. Stonante per l'utente IT. file:
`apps/web/app/features/screenplay-editor/.../Versions*` (estrarre le stringhe in `t()`).
