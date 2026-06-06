# The SplitDrawer is the only drawer: always a collapsing in-flow lane, one at a time, with navigation history

Status: accepted · 2026-06-05

## Context

The app had several drawer surfaces with different mechanics: the Cesare
change-preview and the notification centre rendered as a `position: fixed`
**overlay** SplitDrawer (floated over the page), while the Cesare peek
(`?peek=cesare`) and Versions (`?versions=`) lanes were **in-flow grid columns**
that compressed the page. The result was inconsistent: some drawers overlapped the
content, others reflowed it. The product direction is a single, fluid UI.

## Decision

There is **one drawer in the app — the SplitDrawer** — and it is **always an
in-flow lane that compresses the page**, never a fixed overlay. Every surface it
hosts (Cesare change-preview, notifications, versions, and any future panel)
collapses the main content beside it. This is mandatory for UI/UX.

Only **one** lane is shown at a time (the Notion peek / Claude-Desktop artifact
model): opening a new content **replaces** what is shown, so the page compresses
exactly once. To make "one at a time" non-lossy, the SplitDrawer keeps a
**navigation history** of the contents shown in it: opening a new content pushes
it; header **← / →** move through the stack; **×** closes the drawer and clears
the history. Re-opening a content identical (by a stable key) to one already in
the history brings the existing entry forward instead of duplicating it.

Mechanically the shell grid grows a third track (`body[data-preview-split="open"]`,
same mechanism as `data-cesare-split` / `data-versions-split`) and the SplitDrawer
renders with `placement="lane"`. The `full` state escalates to the primitive's own
overlay route, so no track is reserved then.

## Consequences

- The page always reflows for a drawer; nothing floats over content. Consistent,
  readable, fluid.
- A replaced content is never lost — the history's ←/→ recover it, matching how
  Notion and Claude Desktop behave.
- Future drawer surfaces must register as a SplitDrawer content (a payload kind),
  not invent their own overlay. The notification centre and Cesare preview already
  share the single `SplitDrawerHost`.
- The pre-existing `?peek=cesare` and `?versions=` lanes keep their own routed
  grid tracks; they are mutually exclusive with the shell SplitDrawer lane in
  spirit (one collapsing surface visible at a time) — reconciling them into one
  unified history is possible later but not required by this decision.
