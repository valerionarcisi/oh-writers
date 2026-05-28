# Platform Reach

Oh Writers targets three runtimes, in this order of priority:

1. **Web app** (desktop, primary) — TanStack Start + Monaco editor, full feature set
2. **PWA** (tablet, especially iPad with keyboard) — same codebase as web, installable, offline-aware
3. **Expo companion app** (iOS / Android, mobile-only use cases) — read, review, comment, quick capture, location scouting, push notifications. Scope intentionally narrow: the companion app is **not** a clone of the web editor.

All three runtimes talk to the same backend. Code written today must not close doors to the mobile companion, even though it doesn't exist yet.

## What this means when you write code

- **Domain logic must be framework-agnostic.** Pure functions, Zod schemas, branded types, business rules → live in `packages/domain` and `packages/utils`. No React, no Monaco, no TanStack imports in those packages.
- **Editor-specific glue is isolated.** The Monaco-specific files (`fountain-keybindings.ts`, `fountain-autocomplete.ts`, `fountain-language.ts`) are the only ones that import from `@monaco-editor/react`. The detector, transforms, and constants are editor-agnostic and portable to CodeMirror 6 or any other engine.
- **Auth must support both cookie and bearer token.** Web uses cookie sessions (Better Auth default). The Expo app will use bearer tokens. Server functions and Better Auth config must not hard-depend on cookies.
- **API layer must be callable from outside the web app.** `createServerFn` is the primary path, but any mutation or query that the mobile companion will eventually need must also be reachable via a typed HTTP client. When in doubt about where to put logic, put it behind a server function — never inline in a React component — so it stays accessible.
- **Real-time notifications are a first-class concern.** If a feature generates an event that a collaborator would want to know about (comment, approval, mention, team invite), the event must be published through a channel that both the web app and a future mobile app can subscribe to. Don't rely on polling alone.
- **File operations must be abstracted.** Direct browser-only APIs (`File`, `Blob` download links, `<input type="file">`) should be wrapped in a feature-level function, not called from components. The Expo app will provide the same function backed by `expo-file-system`.

## What this does NOT mean

- Don't write mobile code now. There is no Expo app yet. Don't import from `react-native`, don't add `expo-*` dependencies.
- Don't over-abstract preemptively. Duplication is better than a premature shared layer. Extract only when the second runtime actually materializes.
- Don't design features around mobile-only constraints. The web is the primary product; mobile is a companion.

## Decision triggers

Before merging a feature, ask: "Could a mobile companion reasonably need to call this server function, render this data, or receive a notification for this event?" If yes, make sure the code respects the rules above. If no, don't worry about it.
