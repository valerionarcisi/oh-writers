# Spec 04 — Narrative Editor (Logline, Synopsis, Outline, Treatment)

## User Stories

- As a writer I want to write the logline of my film in a clean editor
- As a writer I want the AI to suggest variants of the logline
- As a writer I want to develop the synopsis with the AI as an interlocutor
- As a writer I want to build the outline scene by scene
- As a writer I want to write the treatment with optional AI support
- As a writer I want to switch between "free" and "assisted" mode at any time

## Document Types

```
logline     → short text (1–3 lines), minimal editor
synopsis    → 1–3 pages, simple rich text editor
outline     → block structure (acts → sequences → scenes), structured editor
treatment   → long text, full rich text editor
```

## Routes

```
/projects/:id/logline
/projects/:id/synopsis
/projects/:id/outline
/projects/:id/treatment
```

## Editor Modes

### Free Mode

- Clean editor, no automatic suggestions
- Only essential formatting tools
- Auto-save every 30 seconds
- Real-time collaboration via Yjs

### Assisted Mode

- AI sidebar on the right (collapsible)
- Contextual panel: the AI "sees" the current document
- Quick actions by document type

#### Logline actions

- Generate 3 alternative loglines
- Make it more concise
- Strengthen the conflict

#### Synopsis actions

- Expand a selected paragraph
- Suggest a scene to add
- Check three-act structure

#### Outline actions

- Suggest a scene for a given sequence
- Identify pacing issues
- Suggest an alternative for a scene

#### Treatment actions

- Expand a section
- Suggest dialogue for a scene
- Identify rhythm issues

## tRPC Procedures

```ts
// documents.get(projectId, type) → Document
// documents.save(documentId, content) → Document
// documents.getYjsState(documentId) → Uint8Array

// ai.assist(documentId, action, selection?) → AsyncIterable<string>  // streaming
```

## AI Integration

- AI calls are server-side only, never client-side
- Response via streaming (Server-Sent Events)
- The AI receives: document type, current content, optional selection, project metadata
- Result shown in a "suggestion bubble" in the sidebar: Copy / Insert at cursor / Replace selection / Discard

## Outline Editor

Structured block editor (not rich text):

```
Act I
  └─ Sequence 1: Introduction
       ├─ Scene 1: [short text]
       ├─ Scene 2: [short text]
Act II A
  └─ ...
```

- Drag & drop to reorder
- Collapse/expand for acts and sequences
- Each scene: number, short description, characters, notes
- Content stored as JSON in the `content` field of the documents table

## Test Coverage

- Auto-save every 30s → content persisted
- Switch free ↔ assisted mode → sidebar appears/disappears
- AI streaming → text appears progressively
- Two users editing simultaneously → no conflicts (Yjs)
