# Spec 11c — Rate Card (Tariffe per persona)

> **Status:** in progress
> **Depends on:** Spec 11b (budget implementation)
> **Date:** 2026-05-12

---

## Problem

`generateBudget` popola `budgetCast` e `budgetCrew` con `dayRate = 0` perché non ha
tariffe associate alle persone del breakdown. L'utente deve poi correggere ogni riga a
mano dopo la generazione.

Serve un posto dove configurare le tariffe **prima** di generare il budget, con supporto
esplicito per i tre modelli contrattuali del cinema italiano.

---

## Modelli contrattuali supportati

| `rateUnit`  | Significato                             | Calcolo                              |
|-------------|-----------------------------------------|--------------------------------------|
| `giornata`  | Compenso per giornata di 8h             | `rateValue × units`                  |
| `posa`      | Mezza giornata (4h); 1 giornata = 2 pose | `rateValue × units`                  |
| `forfait`   | Importo fisso per tutta la produzione   | `rateValue` (units ignorato)         |

`posa` e `giornata` sono unità distinte — il budget mostra le unità così come
l'utente le ha inserite, senza conversione automatica. La conversione è responsabilità
dell'utente (se Filippo chiede 200€/posa e gira 16 pose, units = 16).

---

## Schema DB — modifiche

### Nuova tabella `project_rate_card`

Vive al livello **progetto**, non budget — esiste prima che il budget venga generato.

```sql
CREATE TABLE project_rate_card (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,           -- "Filippo Rossi"
  role          TEXT,                    -- "Attore protagonista"
  rate_unit     TEXT NOT NULL DEFAULT 'giornata',  -- giornata | posa | forfait
  rate_value    NUMERIC(12,2) NOT NULL DEFAULT 0,
  meal_allowance NUMERIC(10,2) NOT NULL DEFAULT 0,
  accommodation  NUMERIC(10,2) NOT NULL DEFAULT 0,
  fiscal_regime TEXT NOT NULL DEFAULT 'piva',      -- piva | privato | none
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
```

### Modifica tabelle esistenti

Aggiungere `rate_unit TEXT NOT NULL DEFAULT 'giornata'` a:
- `budget_cast`
- `budget_crew`

### `budgetRates` — invariata

Usata per tariffe di noleggio/attrezzatura, non per persone. Rimane com'è.

---

## Flusso

```
[Breakdown completo]
        ↓
[Pagina Budget — sezione "Tariffe"]
  • Lista persone del breakdown (cast + crew)
  • Per ognuna: nome, ruolo, rateUnit, rateValue, diaria, alloggio, regime
  • Pulsante "Aggiungi tariffa" per persone non in breakdown
        ↓
[Genera budget — auto o manuale]
  • Legge project_rate_card per popolare budgetCast/budgetCrew
  • Persone senza tariffa → generate con rateValue = 0 + warning ⚠
        ↓
[Widget Cast / Crew — editabile inline come adesso]
```

---

## UI

### Sezione "Tariffe" nella pagina Budget

Appare **sopra** i widget Cast/Crew, sempre visibile (non solo prima della generazione).
Si comporta come un editor di tabella leggera:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Tariffe                                              [+ Aggiungi]   │
├──────────────────┬────────────────┬──────────┬────────┬────────────┤
│ Nome             │ Ruolo          │ Unità    │ €/unità│ Diaria  Alloggio │
├──────────────────┼────────────────┼──────────┼────────┼────────────┤
│ Filippo Rossi    │ Attore princ.  │ giornata │  350   │  50      80  │
│ Maria Bianchi    │ Attrice        │ posa     │  180   │   0       0  │
│ Marco Verdi      │ Dir. fotografia│ giornata │  500   │  80     100  │
│ Comparse (5)     │ —              │ posa     │   80   │   0       0  │
└──────────────────┴────────────────┴──────────┴────────┴────────────┘
```

- Ogni riga è inline-editable (click to edit, Tab to advance)
- `Unità` è un `<select>`: `Giornata · Posa · Forfait`
- Le persone presenti nel breakdown vengono pre-popolate con `rateValue = 0`
  (l'utente deve solo inserire il valore)
- Warning ⚠ sulle righe con `rateValue = 0` dopo la generazione

### Integrazione con auto-generazione (Spec 11c + comportamento da implementare)

Quando l'utente arriva sulla pagina budget e `budget === null`:
1. La sezione Tariffe è vuota o pre-popolata dal breakdown
2. Mostra hint: "Configura le tariffe, poi il budget verrà generato automaticamente"
3. Al primo salvataggio di una tariffa → avvia `generateBudget` in background

Alternativa più semplice (MVP): genera subito con tutti 0, poi l'utente aggiorna
le tariffe e preme "Rigenera". Meno friction nella configurazione iniziale.

**Decisione: genera subito con 0, poi l'utente configura le tariffe e preme "Rigenera".**
L'utente vede immediatamente la struttura del budget; le righe a 0 con warning ⚠
indicano cosa manca. Nessun trigger implicito.

---

## Calcolo `resourceTotal` — aggiornamento

```typescript
// packages/domain/src/budget/resource-total.ts

export type RateUnit = 'giornata' | 'posa' | 'forfait';

export interface ResourceInput {
  rateUnit:       RateUnit;
  rateValue:      number;
  units:          number;   // giornate, pose, o ignorato se forfait
  mealAllowance:  number;   // per unità (ignorato se forfait)
  accommodation:  number;   // per unità (ignorato se forfait)
  fiscalRegime:   FiscalRegime;
}

export const resourceTotal = (r: ResourceInput): number => {
  if (r.rateUnit === 'forfait') {
    return applyFiscalRegime(r.rateValue, r.fiscalRegime);
  }
  const base = r.rateValue * r.units;
  const expenses = (r.mealAllowance + r.accommodation) * r.units;
  return applyFiscalRegime(base, r.fiscalRegime) + expenses;
};
```

La firma attuale di `resourceTotal` usa `days` + `dayRate`. Va aggiornata a
`units` + `rateValue` + `rateUnit`. **Breaking change** — tutti i callsite vanno
aggiornati.

---

## Server functions nuove

| Funzione               | Metodo | Descrizione                                      |
|------------------------|--------|--------------------------------------------------|
| `getRateCard`          | GET    | Lista tariffe del progetto                       |
| `upsertRateEntry`      | POST   | Crea o aggiorna una riga tariffa (by name)       |
| `deleteRateEntry`      | POST   | Elimina una riga                                 |

`generateBudget` va aggiornata per leggere `project_rate_card` e popolare
`budgetCast`/`budgetCrew` con le tariffe configurate.

---

## Migrazioni

- `0020_rate_card.sql` — crea `project_rate_card`
- `0021_budget_rate_unit.sql` — aggiunge `rate_unit` a `budget_cast` e `budget_crew`

---

## Test E2E (Playwright)

| ID       | Scenario                                                         |
|----------|------------------------------------------------------------------|
| OHW-370  | Aggiungi tariffa → appare in lista                               |
| OHW-371  | Genera budget con tariffa → budgetCast mostra valore corretto    |
| OHW-372  | Tariffa forfait → totale non moltiplica per giorni               |
| OHW-373  | Tariffa posa → totale usa `rateValue × pose`                     |

---

## Out of scope

- Importazione tariffe da CCNL (possibile spec futuro)
- Rate per dipartimento invece che per persona
- Storico tariffe / revisioni
