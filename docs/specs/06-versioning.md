# Spec 06 — Versioning

## User Stories

- As a writer I want my screenplay to be saved automatically
- As a writer I want to create a manual version with a label ("Draft 1")
- As a writer I want to see a list of all versions
- As a writer I want to visually compare two versions
- As a writer I want to restore a previous version
- As a writer I want to create a branch from a version to explore alternatives

## Routes

```
/projects/:id/screenplay/versions
/projects/:id/screenplay/versions/:vId
/projects/:id/screenplay/diff/:vId1/:vId2
/projects/:id/screenplay/branches
/projects/:id/screenplay/branches/:bId
```

## Auto-save and Auto-versioning

- Yjs saves every 5 seconds (local + sync)
- Automatic DB snapshot every 5 minutes IF there are changes
- Max 50 automatic snapshots kept (FIFO)
- Manual snapshots are never deleted automatically

## tRPC Procedures

```ts
// versions.list(screenplayId) → Version[]
// versions.get(versionId) → Version
// versions.createManual(screenplayId, label) → Version
// versions.restore(versionId) → Screenplay
// versions.delete(versionId) → void

// branches.list(screenplayId) → Branch[]
// branches.create(screenplayId, name, fromVersionId?) → Branch
// branches.get(branchId) → Branch
// branches.merge(branchId) → Screenplay   // v2
// branches.delete(branchId) → void
```

## Visual Diff

- Uses `diff-match-patch` at line level (better readability for screenplay format)
- Side-by-side or inline (toggle)
- Green = added, Red = removed, Gray = unchanged
- Navigation with arrows, added/removed statistics

## Business Rules

- Restore always creates an auto-save first (safety net)
- You cannot delete the only manual version
- Branch merge is a v2 feature
- Branches have their own separate Yjs room (see Spec 09) and their own scene index
- Predictions are not carried over to branches

## Test Coverage

- Auto-save every 5 min → version created with `isAuto: true`
- Manual version creation → appears in list with label
- Restore → content reverts to that version, auto-save created
- Diff → additions in green, removals in red
- 50 auto-save limit → oldest is deleted
