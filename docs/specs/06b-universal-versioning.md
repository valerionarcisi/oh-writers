# Spec 06b — Universal Document Versioning

Extends Spec 06 (screenplay versioning only) to all document types.

---

## Overview

Every document in a project — logline, synopsis, outline, treatment, and screenplay — gets the same versioning system. The writer can create snapshots, duplicate versions, compare diffs, and restore any previous version.

---

## Naming Convention

Versions follow a simple incremental naming:

```
VERSION-1
VERSION-2
VERSION-3
...
```

The user can optionally add a label to any version:

```
VERSION-1 "First draft"
VERSION-2 "After director notes"
VERSION-3 "Final"
```

Auto-saved snapshots (every 5 minutes, as in Spec 06) get the name `AUTO-<timestamp>` and don't increment the version counter. They're visible in the history but visually distinct (dimmed, smaller).

---

## UI: Versions in the Left Sidebar (StudioBinder Pattern)

Versions live inside the **project sidebar**, not in a separate right panel. When a document is selected in the sidebar, it expands to show its versions as a sub-menu. This is navigational — "which version am I editing?" — not a secondary action.

### Sidebar structure (expanded)

```
WRITING
  ├── Logline
  ├── Synopsis
  ├── Outline
  ├── Treatment
  └── Screenplay          ← clicking expands sub-menu
       ├── + Add New Version
       ├── ● VERSION-3  "Final"         ← active
       ├── ○ VERSION-2  "Director notes"
       └── ○ VERSION-1  "First draft"
```

### Behavior

- Clicking a document name (e.g., "Screenplay") opens the editor for the **latest version** and expands the version sub-menu in the sidebar
- Clicking a specific version switches to editing that version
- The active version is highlighted (filled dot ●, others have empty dot ○)
- Only the currently open document shows its version sub-menu — other documents stay collapsed
- "+ Add New Version" is always at the top of the sub-menu

### Actions per version (popover menu on `...` button or right-click)

- **Duplicate** → creates `VERSION-(N+1)` as a copy of this version, opens it
- **Rename** → edit the label
- **Compare with current** → opens diff view (green/red, as in Spec 06)
- **Restore** → replaces current content with this version's content (creates a new version first as backup)
- **Delete** → only for manual versions, not auto-saves

### Creating a new version

- **Explicit**: click "+ Add New Version" in the sidebar sub-menu. Prompts for an optional label.
- **Duplicate**: from the popover menu on any existing version
- **Auto**: every 5 minutes while editing (already implemented for screenplay, extend to all docs)

### Collapsed sidebar

When the sidebar is collapsed (icon only), clicking a document icon opens the editor for the latest version. The version sub-menu is not visible — the user must expand the sidebar to switch versions.

---

## Data Model Changes

### Current state

```
screenplayVersions
├── screenplayId (FK → screenplays)
├── content (text)
├── yjsSnapshot (bytea)
├── pageCount (integer)
├── label (text, nullable)
├── isAuto (boolean)
├── createdBy (FK → users)
└── createdAt (timestamp)
```

### New: universal `documentVersions` table

```sql
CREATE TABLE document_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Exactly one of document_id or screenplay_id must be set
  document_id   uuid REFERENCES documents(id) ON DELETE CASCADE,
  screenplay_id uuid REFERENCES screenplays(id) ON DELETE CASCADE,
  version_number integer NOT NULL,        -- 1, 2, 3... (auto-saves don't increment)
  label         text,                     -- user-defined label, nullable
  content       text NOT NULL,
  yjs_snapshot  bytea,                    -- Yjs CRDT snapshot, nullable
  word_count    integer DEFAULT 0,        -- for narrative docs
  page_count    integer DEFAULT 0,        -- for screenplays
  is_auto       boolean NOT NULL DEFAULT false,
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamp NOT NULL DEFAULT now(),
  CONSTRAINT version_owner_xor CHECK (
    (document_id IS NOT NULL AND screenplay_id IS NULL) OR
    (document_id IS NULL AND screenplay_id IS NOT NULL)
  )
);

CREATE INDEX idx_doc_versions_document ON document_versions (document_id, created_at DESC)
  WHERE document_id IS NOT NULL;
CREATE INDEX idx_doc_versions_screenplay ON document_versions (screenplay_id, created_at DESC)
  WHERE screenplay_id IS NOT NULL;
```

### Migration strategy

1. Create `document_versions` table
2. Migrate existing `screenplay_versions` data into `document_versions` (with `screenplay_id` set)
3. Drop `screenplay_versions` table
4. Update all server functions and queries

---

## Server Functions

```typescript
// Shared across all document types
createVersion({ documentId?, screenplayId?, label? })
listVersions({ documentId?, screenplayId? })
getVersion({ versionId })
duplicateVersion({ versionId })     // → creates VERSION-(N+1)
renameVersion({ versionId, label })
restoreVersion({ versionId })       // → saves current as new version first, then restores
deleteVersion({ versionId })        // → only manual versions
compareVersions({ versionIdA, versionIdB })
```

---

## Auto-Save Behavior

- Trigger: every 5 minutes while the document has unsaved changes
- Creates an auto-save entry with `is_auto = true` and `version_number` = same as current
- Auto-saves don't increment the version counter
- Keep last 20 auto-saves per document, prune older ones
- Auto-saves are visually separated in the version sidebar (below a divider)

---

## Sidebar Integration

The version sub-menu is part of the `Sidebar` component, not a separate panel. When a document is active:

1. The `Sidebar` receives the active document ID and its versions from the route loader
2. The document's nav item expands to show the version list
3. Clicking a version navigates to that version's route (e.g., `/projects/$id/screenplay?v=VERSION-2`)
4. The active version is highlighted

No separate "Versions" button in the toolbar. The sidebar IS the version navigator — same pattern as StudioBinder's "Screenplay Revisions" in their left sidebar.

---

## Implementation Order

1. Create `document_versions` table + migration
2. Migrate `screenplay_versions` data
3. Server functions (createVersion, listVersions, etc.)
4. `VersionSidebar` shared component
5. Integrate into `NarrativeEditor`
6. Integrate into `ScreenplayEditor` (replace current version system)
7. Auto-save extension for narrative documents
8. Diff view for narrative documents (reuse existing diff component)
