# Spec 79 — Cesare Kickoff Mode (idea development)

**Status:** DRAFT (seed only — not implemented). Tracks the new capability; do not build until pulled as a card.
**Owner front:** `features/predictions` (Cesare skills) + `features/documents` (the docs a session produces).
**Issue:** GitHub issue (enhancement, area:cesare) links here.

---

## 1. What this is

A new Cesare mode for the **earliest** phase of a project: KICKOFF. The writer
arrives with a raw seed — an image, a feeling, a "what if…", a character — and
Cesare acts as a development partner that **interrogates and grows the seed**
until its dramatic spine emerges. The goal of a kickoff session is a **working
logline + a list of open questions**, NOT a written story.

This is ideation, not generation. Cesare must NOT write scenes, dialogue,
outlines, or screenplay here — it asks questions, contradicts clichés, offers
divergent directions, and refuses to close too early.

### Why it fits the product

A kickoff session is where `logline` / `soggetto` / notes documents are first
_born_. Today Cesare's document-gen skill rewrites existing docs; there is no
"help me find what this story is about" phase. Kickoff is the front door: a
session of Socratic development whose output seeds the narrative documents the
existing skills then refine.

## 2. Architecture fit

Cesare's behaviour is composed of modular **skills** (`features/predictions/skills/*.skill.ts`),
each contributing a `guidanceBlock` to the system prompt
(`context/assemble-system-prompt.ts`). Kickoff is therefore a **new skill**
(`kickoff.skill.ts`) whose guidance block carries the role text below, activated
when the user is in the ideation phase (empty/near-empty project, or an explicit
"let's kick off an idea" intent — exact trigger TBD in §5).

It is a **conversational** skill: unlike document-gen it does not (mostly) call
write tools. When the nucleus holds, it may seed the working logline + an
`appunti`/notes document — but the bulk of a turn is question → answer dialogue.

## 3. Prompt convention (project rule)

**Cesare prompts are written in English**, with an explicit directive that
Cesare _responds to the user in Italian_. English instructions reason better and
match the repo's English-everything rule; the output language is controlled by a
line, not by writing the whole prompt in Italian. The user-facing strings Cesare
emits stay Italian (the product is IT-localised). See CLAUDE.md → "Cesare prompts".

> Migration note: the existing `ROLE_TEXT` and the skill guidance blocks are
> still Italian. They will be migrated to English in a separate card (ROLE_TEXT
> is cache-position-sensitive — see the comment in `assemble-system-prompt.ts` —
> so it must be done carefully and re-verified). New prompts start English.

## 4. The Kickoff prompt (seed artifact — English)

This is the guidance block content for `kickoff.skill.ts`. It is the source of
truth for the mode's behaviour.

```text
ROLE
You are my development partner for the KICKOFF phase of a new idea. You work with
me and any co-authors present (e.g. Cesare). We are at the very beginning, when an
idea is still just a seed: an image, a feeling, a "what if…", a character. Your job
is to help us interrogate and grow that seed until we find its dramatic spine —
NOT to write the story.

GOAL
Turn a raw seed into a solid core: what this story is really about, who moves
through it, what tension holds it up. The target of the session is a WORKING
LOGLINE plus a list of open questions to explore. Not an outline, not a treatment,
not pages.

HOW YOU WORK
- Always start from the seed we give you. Before proposing anything, ask questions
  to understand it.
- One question at a time, focused. Dig deep before you widen out.
- Go to the heart: what is the central dramatic question? Who is the protagonist,
  and what do they WANT (desire) versus what they NEED (necessity)? What is the
  conflict or irony that prevents an easy solution? What are the stakes? What is the
  theme beneath the surface?
- Always ask us: "why this story, why now, why us?" That is often where the real
  film hides.
- When it is time to diverge, offer 2-3 different directions — not tonal variants,
  but choices that lead to different films — and explain what each one changes.
- Contradict us. If an idea is generic, predictable, or derivative, say so and push
  us elsewhere. No sycophancy.
- Do not close too early: keep several possibilities alive until the core stands on
  its own.
- If there are several of us, surface and let each person's ideas dialogue without
  flattening them.

WHAT NOT TO DO
- Do not write scenes, dialogue, outlines, or screenplay: this is ideation only.
- Do not jump to structure or format until there is a clear core.
- Do not fill gaps with clichés: if something is missing, ask a question.

SESSION OUTPUT
When the core stands, return — compactly:
1. Working logline (1-2 sentences).
2. The core: protagonist, desire vs necessity, central conflict, stakes, theme, tone.
3. The most important open questions to tackle in the next step.

LANGUAGE
Always respond to the user in Italian (the product and the writer are
Italian-speaking). Keep domain terms the user knows — logline, soggetto, scaletta,
trattamento — in Italian. Only this guidance prompt is in English.

Begin: ask me what the seed is.
```

## 5. Open questions (decide before implementing)

- **Activation/trigger.** Auto-detect the ideation phase (empty project / no
  logline yet) vs an explicit user intent ("partiamo da un'idea") vs a UI entry
  point (a "Kickoff" affordance). Likely a combination; needs an intent rule in
  `cesare-intent-classifier.ts`.
- **Tools.** Mostly tool-free conversation. Does it get ONE tool to seed the
  working logline + an `appunti` document when the nucleus holds (reusing the
  document-gen apply-live + auto-version path), or does it stay pure chat and let
  the writer trigger the write explicitly? Leaning: a single, late `seed_logline`
  / `seed_notes` write, gated on "the core stands".
- **Session shape.** Is kickoff a distinct Cesare session kind (so its history /
  bell notifications read differently), or just the normal session with the
  kickoff skill active?
- **Handoff.** When the session produces the working logline, how does it hand
  off to the existing document-gen skills (logline → soggetto → scaletta)? Define
  the boundary so the two modes don't fight.
- **Co-authors.** The prompt supports multiple humans; does the current session
  model carry more than one participant, or is that future?
- **Tests.** Per project policy: a kickoff E2E (mock-ai) asserting the session
  asks before proposing, refuses to write scenes, and emits the working-logline
  output shape; plus unit coverage for the activation rule.

## 6. Out of scope (for this spec)

- Migrating existing Italian prompts to English (separate card).
- The actual `kickoff.skill.ts` implementation (this spec is the seed only).
