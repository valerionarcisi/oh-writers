# Spec 10d — Cast tier on breakdown elements

> **Status:** in progress
> **Depends on:** Spec 10 (Breakdown), Spec 10c (Inline scene tagging)
> **Date:** 2026-04-22

## Goal

Distinguere i ruoli del cast per **tier industry-standard** così che il primo passo del casting (e in seguito budget e DOOD) possa lavorare su una struttura affidabile, invece di trattare Nonno e Filippo come "interscambiabili".

Quattro tier ufficiali:

| Tier             | Italiano        | English        |
| ---------------- | --------------- | -------------- |
| `principal`      | Principale      | Principal      |
| `supporting`     | Comprimario     | Supporting     |
| `day_player`     | Giornaliero     | Day Player     |
| `featured_extra` | Comparsa scelta | Featured Extra |

Il tier è una proprietà dell'**element** (un personaggio ha un tier costante in tutto il progetto), non dell'occorrenza.

In questo spec aggiungiamo anche un piccolo miglioramento UX al picker "Aggiungi": **categoria default = `cast`** (era `props`). Lo spoglio automatico RegEx — che riempirà il picker con suggestion pre-tipizzate — è oggetto dello Spec 10e (separato).

## Non-goals (Spec 10d)

- Niente assegnazione attore (campo `actorName` o link a una `talent` table) — sarà nello spec Casting.
- Niente DOOD (Day Out of Days) — Spec 12 / 10e.
- Niente regola automatica per assegnare il tier (es. "se il personaggio appare in ≥ X scene → principale"). L'utente sceglie a mano.
- Niente tier per `extras` (la categoria `extras` è già a sé, granularità diversa).

## Architecture

### Domain (`packages/domain/src/breakdown/`)

Nuovo file `cast-tiers.ts`:

```ts
export const CAST_TIERS = [
  "principal",
  "supporting",
  "day_player",
  "featured_extra",
] as const;
export type CastTier = (typeof CAST_TIERS)[number];

export interface CastTierMeta {
  id: CastTier;
  labelIt: string;
  labelEn: string;
}

export const CAST_TIER_META: Record<CastTier, CastTierMeta> = {
  principal: { id: "principal", labelIt: "Principale", labelEn: "Principal" },
  supporting: {
    id: "supporting",
    labelIt: "Comprimario",
    labelEn: "Supporting",
  },
  day_player: {
    id: "day_player",
    labelIt: "Giornaliero",
    labelEn: "Day Player",
  },
  featured_extra: {
    id: "featured_extra",
    labelIt: "Comparsa scelta",
    labelEn: "Featured Extra",
  },
};
```

Update `schemas.ts` — aggiungi `castTier: CastTierSchema.nullable()` a `BreakdownElementSchema`.

### DB (`packages/db/src/schema/breakdown.ts` + migration `0009_add_cast_tier.sql`)

```sql
ALTER TABLE breakdown_elements
  ADD COLUMN cast_tier text;

-- Soft constraint at app level via Zod, ma aggiungiamo un CHECK per sicurezza:
ALTER TABLE breakdown_elements
  ADD CONSTRAINT breakdown_elements_cast_tier_chk
  CHECK (cast_tier IS NULL OR cast_tier IN ('principal','supporting','day_player','featured_extra'));

-- E un soft constraint: il tier ha senso solo per cast.
ALTER TABLE breakdown_elements
  ADD CONSTRAINT breakdown_elements_cast_tier_only_for_cast_chk
  CHECK (cast_tier IS NULL OR category = 'cast');
```

### Server (`features/breakdown/server/breakdown.server.ts`)

- `addBreakdownElement` — aggiungi `castTier: CastTierSchema.nullable().optional()` al validator; persisti il valore.
- `updateBreakdownElement` — accetta `castTier` per consentire la modifica successiva.
- I server di `cesare-suggest` continuano a non impostare il tier (Cesare non assegna tier).

### UI

**`AddElementModal.tsx`**

- Categoria default: `"cast"` (prima `"props"`).
- Quando `category === "cast"` mostra un nuovo `<select>` "Tier" con i 4 valori (default `principal`).
- Submit invia `castTier` solo se categoria è cast.

**`BreakdownPanel.tsx`**

- Nella section `cast`, sotto-raggruppa per tier: ordine `principal → supporting → day_player → featured_extra → (nessuno)`.
- Sotto-header molto piccolo (font-size-xs uppercase) con label IT.
- Le occorrenze pending di Cesare (no tier) finiscono in "non assegnato".

**`ProjectBreakdownTable.tsx`** (vista totale progetto)

- Aggiungi colonna "Tier" subito dopo "Nome", visibile solo quando si filtra/visualizza la categoria cast. Editabile inline (single-cell select) — riusa `useUpdateBreakdownElement`.

### Picker default — perché `cast`

L'utente ha espresso che vuole partire dalla categoria più frequente nel primo tagging manuale. Statistica empirica delle 14 categorie: `cast` e `locations` sono le prime due popolate. `cast` vince perché `locations` è già auto-tagged dall'heading scena.

## Tests

### Unit (Vitest, in `packages/domain/src/breakdown/`)

- `cast-tiers.test.ts` — `CAST_TIER_META` ha entry per ogni valore di `CAST_TIERS`; etichette IT ed EN sono entrambe non vuote.
- `schemas.test.ts` — `BreakdownElementSchema` accetta `castTier: null` e ognuno dei 4 valori; rifiuta valori arbitrari.

### Server (Vitest)

- `breakdown.server.test.ts` — `addBreakdownElement` con `castTier: "principal"` e `category: "cast"` salva il valore; con `category: "props"` e `castTier: "principal"` viene rifiutato dal CHECK constraint (DbError).

### E2E (Playwright)

- `breakdown-cast-tier.spec.ts` `[OHW-300]`:
  1. Login Maria; apri Breakdown del progetto seed.
  2. Apri "Aggiungi" → verifica categoria default = Cast e che compaia il select Tier.
  3. Aggiungi "Roberto" come Day Player; verifica che la sezione Cast mostri sotto-header "Giornaliero" con Roberto sotto.
  4. Aggiungi "Maria" come Principal; verifica ordine: Principale prima di Giornaliero.

## Migration & rollout

- Migration `0009_add_cast_tier.sql` non distruttiva (colonna nullable, default NULL).
- Seed (`packages/db/src/seed/index.ts`): assegna tier ai personaggi noti del fixture "Non fa ridere" (Nonno = principal, Filippo = principal, Roberto = supporting). Resto NULL.
- Rollback: drop column.

## Out of scope

- Casting effettivo (`actorName`, `agencyName`, `availability`).
- DOOD generation.
- Quote price per tier.
- Heuristics automatiche di assegnazione tier.
