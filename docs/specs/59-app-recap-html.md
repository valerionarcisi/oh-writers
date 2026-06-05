# Spec 59 — App recap (HTML, with screenshots)

Status: DONE (2026-06-05). Output: `docs/recap/2026-06-05-app-recap.html` (self-contained,
base64 screenshots) built by `docs/recap/build-recap.mjs` from live captures in
`docs/recap/assets/`. 13-slide showcase tour + 8-strip Narrative-Walk changelog.
Owner: Valerio. Requested 2026-06-05.

## Goal

A single self-contained **HTML page** that recaps the current state of Oh Writers,
combining two things the user asked for together:

1. **The Narrative Walk story** — every fleet topic that was fixed (A1–A6 + N-20),
   shown as before/after where a "before" exists, with the current live screenshot.
2. **A guided tour of the whole app** — feature by feature (auth → dashboard → project
   overview → narrative docs → screenplay → breakdown → budget → schedule → locations →
   Cesare/sessions → settings), each with a live screenshot and a short caption.

**Tone — dual, used with judgement (per the request "entrambi in maniera oculata"):**

- **Showcase** voice for the feature tour (presentable to a third party — investor or
  collaborator): narrative, clean, large screenshots, NO git jargon.
- **Technical** voice in a clearly separated "Cosa è cambiato" strip per Narrative Walk
  topic (for dev/self): what was fixed, before→after, link to the spec/bug id. Kept
  compact, never bleeding into the showcase sections.

The two voices live in **distinct, labelled zones** so a showcase reader can skip the
technical strips.

## Output

- **One file**: `docs/recap/2026-06-NN-app-recap.html` (self-contained — inline CSS,
  images either inlined as base64 OR referenced from a sibling `assets/` folder that
  ships with the HTML; pick base64 if the page must be a single shippable file).
- Uses the design tokens / palette already in the product (teal functional + coral
  decorative — see `feedback_design_decisions`) so it reads as Oh Writers, not a generic
  report. No Tailwind; plain inline CSS is fine for a static artifact.
- Delivered to the user via `SendUserFile` at the end.

## How to produce the screenshots (live, real app)

Mandatory: screenshots are of the **real running app**, not mockups. Per
`docs/conventions/ui-ux-research.md` — drive live, never guess.

1. Bring the stack up: `pnpm dev:up` (postgres+redis), seed (`pnpm db:seed:reset`),
   then `pnpm dev` (web on :3000 + ws-server). Confirm infra before driving.
2. Log in with a seed account that HAS content so screens aren't empty:
   - `test@ohwriters.dev` / `testpassword123` — team with screenplay + scenes
     (see `project_audit_2026_06_02` memory for the full seed map).
   - For locale coverage, capture the key screens in BOTH `it` and `en` only where the
     N-20 i18n fix is the point (SaveStatus, PresenceIndicator, dates) — elsewhere IT is fine.
3. Drive with playwright-cli (named session). Mind the cold-route JIT gotcha (wait /
   refill after `goto`). Capture full-viewport PNGs at a consistent width (1440).
4. Reuse the `vernissage` screenshot harness (`scripts/vernissage-walk.ts`,
   `vernissage/_stories/*.story.json`) if it speeds up a consistent capture set —
   optional, not required.

### Narrative Walk before/after

"Before" images: pull from the walk's original finding screenshots if they still exist
under `docs/audits/2026-06-03/` (the walk referenced `img #N`). If a clean "before"
isn't available for a topic, show only the "after" and label it "stato attuale" — do not
fabricate a before.

## Sections (proposed running order)

**Part 1 — Showcase tour** (product voice):

1. Cover — product name, one-line positioning, date.
2. Entrata: login → dashboard progetti.
3. Progetto: overview / KPI strip.
4. Scrittura narrativa: soggetto/sinossi/scaletta/trattamento (the ProseMirror editor,
   margin notes, save status).
5. Sceneggiatura: the screenplay page. **NOTE:** if A5 (Spec 55a screenplay chrome,
   N-18/N-19) has NOT merged yet when this runs, screenshot the CURRENT screenplay page
   and add a one-line "in lavorazione" note — do not block the recap on A5.
6. Breakdown → Budget → Schedule → Locations (production pipeline).
7. Cesare: floating drawer + sessions + the grounded margin notes (N-27 result).
8. Impostazioni: account + progetto.

**Part 2 — Narrative Walk changelog** (technical voice, compact strips):

- One strip per merged topic: A1 (Spec 55 shell backbone), A2 (Cesare chat UX),
  A3/N-27 (grounding), A4 (sessions), A6 (settings), N-20 (i18n). Each: 1-line what,
  before→after thumbnail pair, spec/bug id. Pull the "Done =" lines from `docs/BUGS.md`.

## Out of scope

- A5 screenplay chrome itself (separate front; recap just shows current state).
- Any code change — this is a documentation/showcase artifact only.
- CI / tests (a static HTML artifact has no test layer; the screenshots ARE the proof).

## Definition of done

- The HTML opens standalone in a browser, all images render, both voices present and
  visually separated, palette on-brand.
- Sent to the user via `SendUserFile`.
- Logged in `docs/BACKLOG.md` DONE.
