# Audit A1 — i18n & Market Gating

**Date:** 2026-06-03  
**Auditor:** A1 (automated Playwright + source grep)  
**App URL:** http://localhost:3001 (MOCK_AI=true, seeded)

---

## Summary

| Severity  | Count |
| --------- | ----- |
| ALTO      | 4     |
| MEDIO     | 3     |
| BASSO     | 2     |
| **Total** | **9** |

---

## Coverage

Pages and flows exercised per locale:

| Page / Flow               | IT  | EN  |
| ------------------------- | --- | --- |
| Login                     | ✓   | ✓   |
| Dashboard                 | ✓   | ✓   |
| Soggetto                  | ✓   | ✓   |
| Sinossi                   | ✓   | ✓   |
| Scaletta                  | ✓   | ✓   |
| Trattamento               | ✓   | ✓   |
| Breakdown                 | ✓   | ✓   |
| Budget                    | ✓   | ✓   |
| Calendario/Schedule       | ✓   | ✓   |
| Location                  | ✓   | ✓   |
| Shooting plan             | ✓   | ✓   |
| Settings                  | ✓   | ✓   |
| Teams                     | ✓   | —   |
| Sceneggiatura/Screenplay  | ✓   | ✓   |
| /opportunities (redirect) | —   | ✓   |
| Soggetto ActionsMenu      | ✓   | ✓   |
| html[lang] flip + persist | ✓   | ✓   |
| locale switch via API     | ✓   | ✓   |
| Market gating SIAE        | ✓   | ✓   |
| Market gating Opportunità | ✓   | ✓   |

**Not exercised:** Sceneggiatura editor deep interactions, Budget full table, Breakdown matrix detail, Teams EN locale (partial), Invite flow.

---

## Findings

---

### F1 — ALTO: `Opportunità` (Fundraising) nav entry absent in IT locale

**Proof:** Source analysis — `apps/web/app/features/app-shell/nav.ts` `PROD_ENTRIES` array contains no `opportunities` entry. Confirmed at runtime: `Opportunities link count in IT: 0` and no `a[href*="opportunities"]` in DOM. Screenshots: `docs/audits/2026-06-03/shots/a1/v2-it-soggetto-full.png`, `docs/audits/2026-06-03/shots/a1/02-it-soggetto.png`.

**Severity justification:** ALTO — the Opportunità feature is spec'd to appear in IT-market nav (Spec 35, Spec 54); it is entirely invisible to Italian users because the nav entry was never added to `buildRailNav`.

**Fix:** Add an opportunities entry to `PROD_ENTRIES` in `apps/web/app/features/app-shell/nav.ts`, conditionally rendered only when `useFeature(Features.FUNDRAISING)` is true. Example entry:

```ts
{
  id: "opportunities",
  segment: "opportunities",
  labelKey: "nav.opportunities",
  glyph: "◈",
}
```

Pass enabled features to `buildRailNav` and filter out entries whose feature is disabled, or let AppShell append the opportunities item only when `useFeature(Features.FUNDRAISING)`.

---

### F2 — ALTO: `ExportSiaeModal` rendered unconditionally in EN locale (visible to DOM/a11y)

**Proof:** Playwright `getComputedStyle` text-node walker on EN soggetto page returned `["Export PDF for SIAE deposit"]` as a visible text node. Buttons `siae-authors-remove-0`, `siae-authors-add`, `siae-export-cancel`, `siae-export-submit` appear in the EN button inventory from the DOM walk. Screenshot: `docs/audits/2026-06-03/shots/a1/v2-en-soggetto-full.png`.

**File:line:** `apps/web/app/routes/_app.projects.$id_.soggetto.tsx:264` — `<ExportSiaeModal isOpen={isSiaeOpen} .../>` rendered unconditionally regardless of `siaeEnabled`.

**Severity justification:** ALTO — the SIAE export modal (Italy-only feature) is rendered in the DOM in EN locale. Assistive technologies traverse closed `<dialog>` content in some configurations. The `siaeEnabled` flag gates only the `ActionsMenu` item; the modal component itself always mounts.

**Fix:**

```tsx
{
  siaeEnabled && (
    <ExportSiaeModal
      isOpen={isSiaeOpen}
      onClose={() => setIsSiaeOpen(false)}
      projectId={projectId}
      defaults={siaeDefaults}
    />
  );
}
```

---

### F3 — ALTO: ~50 hardcoded `"it-IT"` in `Intl.DateTimeFormat` / `Intl.NumberFormat` across features — dates and numbers always Italian-formatted

**Proof:** Source grep — 50 occurrences of `"it-IT"` in `Intl.DateTimeFormat` / `Intl.NumberFormat` / `toLocaleString` calls across `apps/web/app/features/`. Runtime confirmed: EN dashboard shows `"LAST EDIT 3 GIU"` instead of `"3 Jun"`. Screenshot: `docs/audits/2026-06-03/shots/a1/v2-en-dashboard.png`.

Key files (non-exhaustive):

- `apps/web/app/features/projects/components/dashboard/DashboardPage.tsx:105`
- `apps/web/app/features/projects/components/ProjectCard.tsx:39`
- `apps/web/app/features/projects/components/overview/NarrativeCardGrid.tsx:33,41`
- `apps/web/app/features/projects/components/overview/ProjectKpiStrip.tsx:18,22`
- `apps/web/app/features/projects/components/overview/ActivityFeed.tsx:32,39`
- `apps/web/app/features/projects/components/overview/ScreenplaySection.tsx:14,18`
- `apps/web/app/features/budget/components/CategoryFlatTable.tsx:31,38`
- `apps/web/app/features/budget/components/BudgetPage.tsx:487,585`
- `apps/web/app/features/budget/components/BudgetWeeklyView.tsx:77`
- `apps/web/app/features/budget/components/RateCardSection.tsx:26`
- `apps/web/app/features/budget/components/BudgetCapBar.tsx:25`
- `apps/web/app/features/budget/components/drilldowns/ProductionDrillDown.tsx:14,259`
- `apps/web/app/features/budget/components/widgets/` (multiple files)
- `apps/web/app/features/versions/components/VersionsSplitDrawer.tsx:64`
- `apps/web/app/features/versions/components/VersionsList.tsx:408`
- `apps/web/app/features/app-shell/components/NotificationCenterDrawer.tsx:289,294`
- `apps/web/app/features/documents/components/NarrativeCesarePanel.tsx:138`
- `apps/web/app/features/documents/components/FreeNarrativeEditor.tsx:93`
- `apps/web/app/features/schedule/components/ShootingDayDrawer.tsx:104`
- `apps/web/app/features/predictions/cesare.server.ts:1201,1476,1482`
- `apps/web/app/features/breakdown/components/SceneCostPanel.tsx:19`
- `apps/web/app/features/predictions/components/RecapStrip.tsx:40`

**Severity justification:** ALTO — dates show Italian month abbreviations (e.g. "giu", "dic") and numbers use Italian decimal format (comma as decimal separator) for EN users. This is a correctness failure across the dashboard, budget, schedule, versions, and Cesare panels.

**Fix:** The domain package already exposes `formatDate(date, locale)` and `formatNumber(value, locale)` at `packages/domain/src/i18n/format.ts`. Components must call `useLocale()` and pass the locale to these helpers. For module-level `const eur = new Intl.NumberFormat("it-IT", {...})`, refactor to a function that accepts a `locale` param.

---

### F4 — ALTO: Hardcoded Italian strings in `packages/ui` CesareDrawer and LeftRail bypassing `t()`

**Proof:**

- `packages/ui/src/composites/CesareDrawer/CesareDrawer.tsx:555` — `aria-label="Vai alle nuove risposte"`
- `packages/ui/src/composites/CesareDrawer/CesareDrawer.tsx:557` — visible text `↓ Vai alle nuove risposte`
- `packages/ui/src/composites/CesareDrawer/CesareDrawer.tsx:628` — `aria-label="Invia messaggio"`
- `packages/ui/src/shell/LeftRail/LeftRail.tsx:356` — `triggerLabel={\`Azioni sessione: ${session.title}\`}`
- `packages/ui/src/shell/LeftRail/LeftRail.tsx:358` — `triggerTitle="Azioni sessione"`

Runtime confirmed: EN soggetto button inventory includes `{"text":"↓ Vai alle nuove risposte","ariaLabel":"Vai alle nuove risposte"}` and `{"ariaLabel":"Invia messaggio","testId":"cesare-send-btn"}` and `{"ariaLabel":"Azioni sessione: Sessione principale","testId":"session-actions-btn"}` when locale=en.

**Severity justification:** ALTO — these are user-facing visible text and aria-labels in the primary AI interaction surface (Cesare drawer) and left rail. Every EN user sees Italian text in these core UI elements.

**Fix:** The `packages/ui` components are framework-agnostic (no React hooks context). Thread label props from the calling components in `apps/web/app/features/predictions/` and `apps/web/app/features/app-shell/` which have access to `useTranslation()`. Add translation keys:

- `"cesare.scroll.nudge"` / `"cesare.composer.send"` to `keys/predictions.ts`
- `"shell.rail.sessionActions"` / `"shell.rail.sessionActionsLabel"` to `keys/appShell.ts`

---

### F5 — MEDIO: All route `head()` page titles hardcoded in Italian

**Proof:** Source grep — every route `head: () => titleHead("...")` call uses hardcoded Italian:

- `apps/web/app/routes/_app.settings.tsx:6` → `"Impostazioni"`
- `apps/web/app/routes/_app.projects.$id_.synopsis.tsx:7` → `"Sinossi"`
- `apps/web/app/routes/_app.projects.$id_.schedule.tsx:6` → `"Calendario"`
- `apps/web/app/routes/_app.projects.$id_.shooting-plan.tsx:7` → `"Piano Inquadrature"`
- `apps/web/app/routes/_app.projects.$id_.treatment.tsx:7` → `"Trattamento"`
- `apps/web/app/routes/_app.projects.$id_.screenplay.tsx:5` → `"Sceneggiatura"`
- `apps/web/app/routes/_app.projects.$id_.outline.tsx:7` → `"Scaletta"`
- `apps/web/app/routes/_app.projects.$id_.soggetto.tsx` (implicitly via `titleHead("Soggetto")`)
- `apps/web/app/routes/login.tsx:20` → `"Accedi"`
- `apps/web/app/routes/register.tsx:16` → `"Registrati"`

**Severity justification:** MEDIO — browser `<title>` is always Italian for EN users. Visible in browser tabs, bookmarks, history, and screen-reader page announcements.

**Fix:** Use `loaderData`-driven titles by calling `translate(locale, key)` inside `head()` using the root loader's `locale`. TanStack Router's `head()` receives `ctx.loaderData` so locale is accessible.

---

### F6 — MEDIO: `DEFAULT_PRIMARY_SESSION_TITLE` permanently Italian `"Sessione principale"`

**Proof:** `apps/web/app/features/predictions/sessions/sessions.schema.ts:58` — `export const DEFAULT_PRIMARY_SESSION_TITLE = "Sessione principale";`. Runtime: EN page shows session label `"✦Sessione principale28m"`, aria-label `"Sessione Cesare: Sessione principale"` in EN button inventory.

**Severity justification:** MEDIO — default Cesare session name permanently Italian for EN users, visible in left rail and session selector.

**Fix:** Add `"cesare.sessions.defaultTitle"` translation key (EN: "Main session", IT: "Sessione principale") and use the locale-resolved value at session creation time.

---

### F7 — BASSO: `/opportunities` route `head()` hardcodes Italian `"Opportunità"`

**Proof:** `apps/web/app/routes/_app.projects.$id_.opportunities.tsx:29` — `head: () => titleHead("Opportunità")`.

**Severity justification:** BASSO — this route is IT-market only (redirects in EN), so EN users never encounter it. Italian title is correct for the IT market, same structural issue as F5.

**Fix:** Address as part of the F5 batch fix.

---

### F8 — BASSO: Schedule PDF export generates Italian footer text

**Proof:** `apps/web/app/features/schedule/lib/export-pdf.ts:100` — `"Generato il ${new Date().toLocaleDateString("it-IT", ...)} · ${days.length} ${days.length === 1 ? "giornata" : "giornate"}"`.

**Severity justification:** BASSO — PDF documents exported by EN users will show Italian footer. The schedule feature is universal (not IT-only), so this affects EN users.

**Fix:** Pass locale to the PDF generation function and add `"schedule.pdf.generatedOn"`, `"schedule.pdf.days.singular"`, `"schedule.pdf.days.plural"` keys to `packages/domain/src/i18n/keys/schedule.ts`.

---

## Market Gating Verification Results

| Gate                                                          | Expected                    | Result                                                   |
| ------------------------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| `/opportunities` redirects in EN                              | Redirect to `/projects/:id` | **PASS** — screenshot `16-en-opportunities-redirect.png` |
| SIAE ActionsMenu item absent in EN                            | Hidden                      | **PASS** — no SIAE item in EN actions menu               |
| SIAE ActionsMenu item present in IT                           | Visible                     | **PASS** — screenshot `03-it-soggetto-actions-menu.png`  |
| `html[lang]="it"` on IT pages                                 | `lang="it"`                 | **PASS** — all IT pages confirmed                        |
| `html[lang]="en"` on EN pages                                 | `lang="en"`                 | **PASS** — all EN pages confirmed                        |
| Locale persists after navigation                              | Same locale                 | **PASS** — confirmed on 6 EN pages post-switch           |
| `resolveFeatures` uses `useFeature` (not inline locale check) | `useFeature()`              | **PASS** — confirmed in source                           |

---

## Appendix — Screenshot Index

| Screenshot                                  | Description                                   |
| ------------------------------------------- | --------------------------------------------- |
| `shots/a1/00-after-login.png`               | Post-login state                              |
| `shots/a1/01-it-dashboard.png`              | Dashboard in IT                               |
| `shots/a1/02-it-soggetto.png`               | Soggetto in IT                                |
| `shots/a1/03-it-soggetto-actions-menu.png`  | Soggetto ActionsMenu open (IT) — SIAE present |
| `shots/a1/13-en-soggetto.png`               | Soggetto in EN                                |
| `shots/a1/14-en-breakdown.png`              | Breakdown in EN                               |
| `shots/a1/15b-en-soggetto-actions-open.png` | Soggetto ActionsMenu open (EN) — SIAE absent  |
| `shots/a1/16-en-opportunities-redirect.png` | /opportunities redirect in EN — PASS          |
| `shots/a1/17-back-to-it-soggetto.png`       | Soggetto after switching back to IT           |
| `shots/a1/25-en-dashboard.png`              | Dashboard in EN                               |
| `shots/a1/v2-it-soggetto-full.png`          | Full soggetto page IT (verification)          |
| `shots/a1/v2-en-soggetto-full.png`          | Full soggetto page EN (F2 evidence)           |
| `shots/a1/v2-it-settings.png`               | Settings IT                                   |
| `shots/a1/v2-en-settings.png`               | Settings EN                                   |
| `shots/a1/v2-it-dashboard.png`              | Dashboard IT (verification)                   |
| `shots/a1/v2-en-dashboard.png`              | Dashboard EN (F3 evidence — "3 GIU")          |
