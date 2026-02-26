# Oh Writers — Screenplay Collaboration Platform

## Vision

Oh Writers is an online platform for screenplay writing, designed for individual authors and creative teams. It combines a professional screenplay editor with narrative development tools (logline, synopsis, outline, treatment) and AI-powered production intelligence.

The goal is to provide a serious, distraction-free writing environment with real-time collaboration and intelligent predictions on production cost and risk.

---

## Guiding Principles

- **Writer-centric**: the UI gets out of the way when you write
- **Local-first dev**: the app runs 100% locally with mocks and Docker — no external services required to develop
- **Brutalist & Modern**: direct design, strong typography, no unnecessary decoration
- **Type-safe end-to-end**: TypeScript everywhere, Zod as the source of truth
- **No magic**: explicit, composable, testable code

---

## Feature Set

### Auth & Identity

- Registration and login with email/password
- OAuth (Google, GitHub)
- User profile with avatar and bio
- Persistent sessions with refresh token

### Team & Collaboration

- Team creation with name and slug
- Member invitation via email with roles (Owner, Editor, Viewer)
- Projects associated with a team or an individual user
- Real-time collaborative writing via Yjs (CRDT)
- User presence in the editor (colored cursors)

### Projects

- Each project is a film/series with metadata (title, genre, format)
- Dashboard with all projects (personal and team)
- Archive and soft-delete

### Narrative Development (with/without AI assistant)

Each project has development documents in sequence:

1. **Logline** — one sentence, the film's premise
2. **Synopsis** — 1–3 pages, narrative description
3. **Outline** — scene-by-scene structure (acts, sequences)
4. **Treatment** — extended pre-screenplay version

Each document can be written freely or with AI assistance (suggestions, expansions, alternatives).

### Screenplay Editor

- Professional screenplay format (Courier 12pt, standard margins)
- Elements: Scene Heading, Action, Character, Parenthetical, Dialogue, Transition
- **Monaco Editor** as the base with a custom language server
- Keyboard shortcuts for navigating between elements (Tab to advance to the next element)
- Autocomplete for characters and locations already used
- Real-time page counter (1 page ≈ 1 minute)
- Focus mode (fullscreen, everything hidden)
- PDF export in standard format

### Versioning

- Each save generates an automatic snapshot
- Manual versions with a label (e.g. "Draft 1", "After notes")
- Visual diff between versions
- Restore to a previous version
- Branching: create a variant from a version

### AI Predictions

- **Production cost per scene**: analysis of characters present, location (int/ext, day/night), special effects, vehicles, extras — estimate as a range (€ low / mid / high)
- **Scene risk**: weather parameters for the location, time of year, technical complexity — traffic light (green/yellow/red) with rationale

### Infrastructure

- Docker Compose for development and production
- Realistic seed data scripts
- Migration scripts (Drizzle Kit)
- Release scripts with version bumping (semver)
- Mock server for development without external dependencies

---

## Future Roadmap

- **Location Manager**: given scene text, automatically search for suitable real locations via Google Maps / OpenStreetMap + filters (distance from city, environment type, accessibility)
- Native mobile app (React Native) with reading and annotation features

---

## Out of Scope (v1)

- Full budget management
- Production breakdown (scheduling)
- Integration with production software (Movie Magic, etc.)
- Screenplay marketplace
