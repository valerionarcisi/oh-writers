# Spec 06f — Draft color shared across all writing documents

## Goal

The Hollywood revision color/date that lives on the screenplay's current
version (spec 06e) becomes the **single source of truth** for the entire
"writing" surface of a project. All other writing documents (logline,
synopsis, outline, treatment) and the title page display the same color +
date as a read-only badge.

## Source of truth

- Mutable: only on screenplay versions (spec 06e). Editable from the
  Versions drawer on `/projects/$id/screenplay`.
- Readable: from any document page that wants to show "what draft are
  we currently in".

## Resolution rules

`getProjectDraftMeta(projectId)` returns `{ draftDate, draftColor }`:

1. Find the project's screenplay (one per project).
2. Resolve `currentVersionId`.
3. If that version has `draftColor === null`, **lazily backfill**
   white + today on the screenplay version row, then return those
   values. This heals projects created before spec 06e.
4. Return `(version.draftDate, version.draftColor)`.

If a project has no screenplay yet (legacy projects without
`ensureFirstVersion` having run), return `(null, null)`.

## API surface

Add **one** new server function in `features/projects/server`:

```ts
export const getProjectDraftMeta = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().uuid() }))
  .handler(/* … resolves per rules above … */);

export const projectDraftMetaQueryOptions = (projectId) =>
  queryOptions({
    queryKey: ["projects", projectId, "draft-meta"],
    queryFn: () => getProjectDraftMeta({ data: { projectId } }),
  });
```

`getTitlePageState` keeps using the same internal helper — its returned
`state.draftColor / state.draftDate` already reflect the version, so no
shape change there.

When a screenplay version's color/date changes, invalidate
`["projects", projectId, "draft-meta"]` alongside the existing
`["versions", screenplayId]` and `["projects"]` keys.

## UI surface

Each writing-document route renders a small read-only badge near the
toolbar showing the current draft color + date. The badge:

- Same swatch + label vocabulary as the title page panel.
- Hover/title: `Draft date — managed in Versions on the screenplay`.
- Hides itself when meta is `(null, null)`.

Pages affected:

- `_app.projects.$id_.logline.tsx`
- `_app.projects.$id_.synopsis.tsx`
- `_app.projects.$id_.outline.tsx`
- `_app.projects.$id_.treatment.tsx`
- `_app.projects.$id_.screenplay.tsx` (also gets character / page counter — see below)

A new shared component `DraftMetaBadge` lives in
`features/projects/components/` and is reused by all five routes plus
the title page (which keeps its bigger panel UI).

## Title page

Bug: title page currently shows "Not set". After lazy backfill the field
will populate. No UI change required beyond invalidating the
`title-page-state` query when the screenplay version meta updates.

## Screenplay character / page counter

The synopsis and treatment editors render a `· {n} characters · ~{p}
page(s)` line at the bottom of the editor. The screenplay editor does
not. Add the same line, computed from the screenplay's current version
content.

- Characters: count of plain text content in the editor.
- Pages: existing `pageCount` already used by the version row — reuse
  the same calc.

## Out of scope

- Per-document version history with its own colors.
- Editing color/date from anywhere other than the Versions drawer.
- Backfill for projects with no screenplay row at all.

## Tests

- Unit: `getProjectDraftMeta` resolution rules (no screenplay → null,
  null color triggers backfill, color present → passthrough).
- Playwright: change color in Versions drawer, navigate to synopsis /
  treatment / logline / outline, badge reflects new color.
