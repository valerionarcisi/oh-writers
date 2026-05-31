# Spec 33 — Cesare: Screenplay Live Sidebar

> **Superseded for shell layout by [Spec 44](./44-shell-refactor-notion-style.md).** The "Pannello collassabile a destra dell'editor" pattern below is replaced: there is no right-anchored Cesare column anymore. Cesare ships as the Notion-class floating drawer (Spec 44), so the live scene-aware analysis is delivered through the shell-level drawer (header context chip + Step Block) rather than a screenplay-only sidebar. The domain logic (trigger on scene change, debounce, prompt format) remains authoritative.

## Overview

La sidebar Cesare nella sceneggiatura mostra suggerimenti contestuali alla
scena visibile nell'editor senza che l'utente debba aprire il pannello chat
e fare una domanda. Si attiva automaticamente quando la scena attiva cambia
(via `ActiveSceneContext`) e mostra una card con analisi breve.

---

## UX

- Pannello collassabile a destra dell'editor, sotto il pannello categorie breakdown
- Trigger: cambio di scena attiva (debounce 1s per non fare troppe chiamate)
- Contenuto: analisi breve (max 3 punti) sulla scena corrente
  - Tono e ritmo del dialogo
  - Elementi di produzione da tenere d'occhio
  - Suggerimento concreto per migliorare la scena
- Formato: 3 bullet, non più di 80 caratteri ciascuno
- L'utente può aprire il full chat da lì con la domanda pre-compilata

## Placement

Nella `ScreenplayEditor`, il layout ha già una colonna destra per i controlli.
La sidebar Cesare si aggiunge sotto come sezione collassabile, con toggle
nella viewbar (icona ✦).

## Trigger

```
scena cambia → debounce 1000ms → callCesareInline(sceneId, sceneNumber)
→ mostra risultato nella sidebar
```

Non usa lo streaming — risposta completa in una volta sola.

## System prompt inline

```
Sei Cesare. Analizza questa scena in 3 bullet concisi (max 80 car ciascuno):
- Tono/ritmo
- Elemento produzione critico
- Un suggerimento concreto

Scena: ${heading}
---
${body}
---
Rispondi solo con i 3 bullet. Niente intro.
```

## Dati

Usa `scenes.notes` già disponibile — stesso meccanismo di Spec 32.

---

## Implementazione

### Componente `CesareSidebarPanel`

```
apps/web/app/features/screenplay-editor/components/CesareSidebarPanel.tsx
```

Props:

- `projectId: string`
- `sceneId: string | null`
- `sceneNumber: number | null`
- `isCollapsed: boolean`
- `onToggle: () => void`

Stato interno:

- `bullets: string[]` — 3 bullet dall'analisi
- `isLoading: boolean`
- `lastSceneId: string | null` — per evitare ri-fetch sulla stessa scena

### Server function `getCesareSceneAnalysis`

```typescript
// cesare.server.ts
export const getCesareSceneAnalysis = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid(), sceneNumber: z.number() }))
  .handler(...)
```

Ritorna `ResultShape<string[], CesareError>` — array di 3 bullet.

### ScreenplayEditor wiring

Aggiungere `CesareSidebarPanel` nella colonna destra dell'editor.
Toggle nella viewbar accanto agli altri controlli.

---

## Tests

**File:** `tests/screenplay-editor/cesare-sidebar.spec.ts`

- `[OHW-530]` Sidebar appare quando scena attiva cambia
- `[OHW-531]` Bullet si aggiornano dopo debounce con nuova scena
- `[OHW-532]` Click "Chiedi a Cesare" apre il full chat con contesto scena
