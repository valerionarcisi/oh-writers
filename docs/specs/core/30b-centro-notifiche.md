# Spec 30b — Centro Notifiche

Sub-spec di Spec 30 — Bandi & Finanziamenti. Definisce il sistema di notifiche in-app per eventi relativi a bandi, scadenze e match AI.

---

## Vision

L'utente apre Oh Writers e vede un badge sull'icona campanella: "Scadenza MiC Sviluppo tra 7 giorni" e "3 nuovi bandi compatibili con Il Commissario della Notte". Nessuna email da leggere, nessun portale da monitorare.

---

## Schema Dati

### `notifications`

```ts
notifications {
  id: uuid PK
  userId: uuid FK users

  type: NotificationType
  title: string               // testo breve in italiano
  body: string | null

  // Link contestuale
  opportunityId: uuid | null FK funding_opportunities
  projectId: uuid | null FK projects

  severity: NotificationSeverity  // 'info' | 'warning' | 'urgent'
  isRead: boolean                 // default false
  readAt: timestamp | null

  // Deduplicazione
  deduplicationKey: string | null   // UNIQUE where not null
  expiresAt: timestamp | null       // auto-archivio

  createdAt: timestamp

  INDEX (userId, isRead, createdAt)
  UNIQUE (deduplicationKey) WHERE deduplicationKey IS NOT NULL
}
```

**Formato `deduplicationKey`**: `{type}_{opportunityId}_{userId}_{projectId}_{window}`
Esempio: `deadline_7d_opp_abc123_user_xyz_proj_def`

### `notification_preferences`

```ts
notification_preferences {
  id: uuid PK
  userId: uuid FK users UNIQUE    // 1 record per utente

  inAppEnabled: boolean           // default true
  emailEnabled: boolean           // default false — opt-in esplicito
  emailDigestFrequency: DigestFrequency  // 'immediate' | 'daily' | 'weekly' | 'never'

  notifyOnNewMatch: boolean           // default true
  notifyOnDeadline30d: boolean        // default false
  notifyOnDeadline7d: boolean         // default true
  notifyOnDeadline1d: boolean         // default true
  notifyOnOpportunityUpdate: boolean  // default false
  notifyOnOpportunityExpired: boolean // default true

  includeNational: boolean     // default true
  includeRegional: boolean     // default true
  includeEuropean: boolean     // default true
  includeInternational: boolean // default true
  includeTaxCredit: boolean    // default true

  createdAt: timestamp
  updatedAt: timestamp
}
```

Creata automaticamente alla creazione dell'utente (valori di default).

---

## Tipi e Severity

| `NotificationType` | Severity default | Trigger |
|---|---|---|
| `new_match` | `info` | Nuovo bando pubblicato con score ≥ 70 su progetto attivo |
| `deadline_approaching` | `warning` | Scadenza entro 30 o 7 giorni per bando in watching o score ≥ 70 |
| `deadline_tomorrow` | `urgent` | Scadenza domani |
| `opportunity_updated` | `info` | Bando aggiornato (importo, requisiti, proroga) mentre utente è in watching |
| `opportunity_expired` | `warning` | Bando in watching passa a expired |
| `reminder_custom` | `info` | Reminder manuale impostato dall'utente |
| `profile_incomplete` | `info` | Profilo di finanziamento incompleto, 48h dopo creazione progetto |

---

## Job di Generazione

Due job server-side, non real-time:

**Job A — Al publish di ogni bando**
Calcola match su tutti i progetti `active` dell'utente. Crea `notifications` di tipo `new_match` per score ≥ 70. Aggregazione: max 3 notifiche `new_match` per utente per giorno (se 5 bandi compatibili → 1 notifica aggregata "3 nuovi bandi compatibili con [Progetto X]").

**Job B — Cron giornaliero (09:00)**
- Scadenze imminenti: controlla `nextDeadline` di tutti i bandi `active`. Genera `deadline_approaching` / `deadline_tomorrow` con dedup key.
- Auto-expire: porta a `expired` tutti i bandi `active` con `nextDeadline` passata. Genera `opportunity_expired` per gli utenti in watching.
- Cleanup: elimina notifiche con `expiresAt` passata.

---

## UI — Centro Notifiche

### Icona campanella (TopBar)

- SVG 20×20px, posizionata a destra nella TopBar tra [?] e avatar utente
- Badge coral (`--color-urgent`) con contatore non-letti
- Badge visibile solo se contatore > 0 (non mostra "0")
- Click apre il panel

### Panel (popover)

Aperto con `useOverlay` + `useDialog` da `react-aria` (obbligatorio per CLAUDE.md §25).

```
╔══════════════════════════════════════════════╗
║  Notifiche                    Segna tutte ✓  ║
║  ─────────────────────────────────────────── ║
║                                               ║
║  ● OGGI                                       ║
║                                               ║
║  ╔═══════════════════════════════════════╗   ║  ← bordo sinistro coral (urgent)
║  ║ 🔴  SCADENZA OGGI                     ║   ║
║  ║     Bando MiC — Cinema di Qualità     ║   ║
║  ║     Scadenza ore 23:59 — oggi         ║   ║
║  ║  [Vai al bando →]   [Ignora]          ║   ║
║  ╚═══════════════════════════════════════╝   ║
║                                               ║
║  ╔═══════════════════════════════════════╗   ║  ← bordo sinistro amber (warning)
║  ║ 🟡  SCADENZA TRA 3 GIORNI             ║   ║
║  ║     Eurimages — Development Grant     ║   ║
║  ║     Scade il 20 maggio 2026           ║   ║
║  ║  [Vai al bando →]   [Salva]           ║   ║
║  ╚═══════════════════════════════════════╝   ║
║                                               ║
║  ● QUESTA SETTIMANA                           ║
║                                               ║
║  ╔═══════════════════════════════════════╗   ║  ← bordo sinistro teal (info)
║  ║ 🟢  NUOVO BANDO COMPATIBILE            ║   ║
║  ║     IDM Film Fund — Südtirol 2026     ║   ║
║  ║     Compatibilità stimata: 87%        ║   ║
║  ║  [Vedi dettaglio →]   [Salva]         ║   ║
║  ╚═══════════════════════════════════════╝   ║
║                                               ║
║  ─────────────────────────────────────────── ║
║  [Vedi tutte le notifiche →]                 ║
╚══════════════════════════════════════════════╝
```

- **Larghezza**: 380px fissi
- **Max-height**: 520px, scroll interno sul contenuto
- **Ordine**: urgent in cima sempre, poi per data
- **"Segna tutte ✓"**: marca tutte come lette, badge sparisce
- **"Vedi tutte"**: porta a `/notifications` — pagina full con storico, filtri, paginazione

### Colori urgenza

| Severity | Bordo sinistro | Icona |
|----------|---------------|-------|
| urgent | `--color-urgent` (coral) | 🔴 |
| warning | `--color-warning` (amber) | 🟡 |
| info | `--color-accent` (teal) | 🟢 |
| reminder | `--color-text-subtle` (grigio) | 🔔 |

---

## Preferenze Notifiche

Accessibili da Settings utente (`/settings/notifications`). Non in un modale — pagina dedicata.

Sezioni:
- **Canali**: in-app (sempre attivo), email (opt-in), frequenza digest
- **Tipi di evento**: toggle per ogni `NotificationType`
- **Livelli bando**: toggle per includere/escludere nazionale, regionale, europeo, internazionale

---

## Dipendenze

- Spec 30 — Bandi & Finanziamenti (genera gli eventi che questa spec consegna)
- Spec 25 — React Aria Adoption (`useOverlay`, `useDialog` obbligatori per il panel)

---

## Tests

| Tag | File | Scenario |
|-----|------|---------|
| OHW-310 | `tests/notifications/notifications-panel.spec.ts` | Happy: badge mostra contatore non-letti |
| OHW-311 | `tests/notifications/notifications-panel.spec.ts` | Happy: click "Segna tutte" → badge sparisce |
| OHW-312 | `tests/notifications/notifications-panel.spec.ts` | Happy: notifica urgent appare in cima |
| OHW-313 | `tests/notifications/notifications-panel.spec.ts` | Happy: click su notifica segna come letta e naviga al bando |
| OHW-314 | `tests/notifications/notifications-preferences.spec.ts` | Happy: disabilita `notifyOnNewMatch` → no nuove notifiche di tipo new_match |
| OHW-315 | `tests/notifications/notifications-cron.spec.ts` | Happy: bando con deadline domani → genera notifica urgent |
| OHW-316 | `tests/notifications/notifications-cron.spec.ts` | Dedup: job eseguito due volte non crea notifica duplicata |
