# Spec 80 — One liquid scene-edit tool (retire find/replace)

Status: DONE (2026-07-01). Phase 1: rewrite*scene is the UNIVERSAL single-scene
edit tool; the classifier + routing prompt send every single-scene change
(add/cut/move/reword) to it. Verified live on seed project 010: "aggiungi un
cameriere Marco in scena 3" returns the whole scene via rewrite_scene — cue/
dialogue land as real Fountain nodes, right scene, zero duplicate proposals,
green whole-scene overlay. Phase 2: propose_screenplay_edit and its dead code are
DELETED — the tool defs, executeProposeScreenplayEdit, the edit branch/helpers in
proposed-edit-decoration (locateEdit, findFlexibleWhitespace, parseReplacementBlocks,
containingBlockRange, scene scoping), the PROPOSAL*\*\_LIMIT constants, the
entity-map + prompt + skill + mock references, and the edit-only tests. The
rename path (propose_rename_entity) is untouched: it still shares the
PROPOSAL_STORE bucket + decoration plugin (whole-word doc-wide matching), the
screenplay-proposal marker, and the sceneNumber field (renames set it null). The
propose_screenplay_edit bug class (#85/#86/#87/#88) is now structurally
impossible. Only historical docs/specs still mention the retired tool by name.

## Context

A writer can ask _anything_ about a scene — add a character, cut a line, move a
beat, reword, reorder. The current screenplay surface answers with **one tool per
verb** (`rewrite_scene` for whole-scene, `propose_screenplay_edit` for
find/replace, plus `merge_scenes`/`delete_scene`/`propose_screenplay_revision`).
This forces the model to classify intent into a rigid bucket, and the find/replace
bucket in particular is built on a **fragile verbatim string anchor** that caused
bugs #83/#85/#86/#87: "aggiungi un cameriere in scena 3" broke because there is no
_insert_ tool, so the model crammed an insertion into find/replace and the anchor
matched the wrong scene / no scene / drifted on whitespace.

A survey (2026-07-01) confirmed two things that scope this tightly:

1. **The narrative-doc side is ALREADY unified** — logline/soggetto/synopsis/
   outline/treatment all revise through `auto-version.effect.ts`
   (`commitOrAsk` → `resolveVersionAction` → `applyVersionLive`), with
   version-before-apply, the Spec-76 large-edit ask, and `changedWordRatio`. It is
   NOT the problem and is out of scope.
2. **The bug lives entirely on the screenplay-scene side.** The scene apply path
   (`startPendingEdit`, in-place green highlight) is separate and healthy; the
   find/replace tool is the rotten part.

**Decision:** collapse the scene-level screenplay edits into ONE tool — the model
returns the full revised scene, whatever the verb — and retire `propose_screenplay_edit`.
Add/cut/move/reword/reorder all become "here's the scene after your change."
Reuses the existing, tested `rewrite_scene` apply. The narrative side and the
draft/rename flows are untouched.

(The broader cross-domain `rewrite_doc` facade over narrative + version worlds was
considered and rejected as too large/risky for the actual bug — the narrative
side is already consolidated, and bridging its 5 apply/CRDT contracts would be
ocean-boiling. If ever wanted, it is a separate future spec.)

## The tool

Generalise `rewrite_scene` into the universal scene editor. Model-facing name:
**`edit_scene`** (verb-neutral; "rewrite" biased the model toward full rewrites
over surgical adds). Internal marker/event names stay `rewrite-scene` to avoid
churn.

```
edit_scene({ scene_number, new_content, scope, summary }) → { marker, scope, summary }
```

- `scene_number` — ordinal, anchored per the N1 fix (already shipped)
- `new_content` — the FULL revised Fountain of that scene (any change)
- `scope` — model self-report: `"micro" | "scene"` (a scene-level tool never emits
  `structural`; that routes to `propose_screenplay_revision`)
- `summary` — one line for the result card ("Aggiunto un cameriere")

Apply is the existing `startPendingEdit` in-place green preview + accept/reject,
which already preserves the scene number (N2) and anchors correctly (N1). The
`scope` is advisory for the result-card copy; the apply is identical either way
(whole-scene green). `scope` is cross-checked against a computed changed-word
ratio so a mislabelled "micro" that rewrote everything still reads honestly.

## What is retired vs kept

**Retired — `propose_screenplay_edit` (the `kind:"edit"` path only):**

- The tool definition + `executeProposeScreenplayEdit` + its factory/legacy
  dispatch branches (`cesare-screenplay-tools.ts`).
- The `kind === "edit"` branch of `findAllMatches` in `proposed-edit-decoration.ts`
  - the whitespace/scene-scoping helpers added for #86/#87 (`locateEdit`,
    `findFlexibleWhitespace`, the edit scope path) — dead once edits are gone.
- `propose_screenplay_edit` from `CESARE_SCREENPLAY_TOOLS`,
  `cesare-tool-entity-map.ts`, `cesare-universal-tools.ts`, the mock, the skill.
- `micro_edit` intent → remap to the scene-edit tool (fold into `rewrite_one_scene`)
  in `cesare-intent-classifier.ts` `TOOL_BY_INTENT`.
- The now-unused `PROPOSAL_FIND/TEXT/REASON_LIMIT` constants.
- The `propose_screenplay_edit` string in `SCREENPLAY_PROPOSAL_TOOLS`
  (`cesare-tools.ts`) — the marker stays (renames/revision still emit it).
- Edit-only tests; the `proposed-edit-decoration` edit-scoping cases I just wrote.

**Kept, unchanged (SHARED with the retired path — must NOT be deleted):**

- `propose_rename_entity` + the WHOLE `proposed-edit-decoration` plugin,
  `PROPOSAL_STORE` bucket, `useScreenplayProposals`/refetch,
  `ohw:cesare:screenplay-proposal` marker+event+strip,
  `clearScreenplayEditProposalsFn` — renames legitimately use doc-wide matching
  and the bucket. The decoration plugin's rename branch keeps it all alive.
- `propose_screenplay_revision` / `merge_scenes` / `delete_scene` — the DRAFT
  version flow. `edit_scene` does NOT touch this; `scope:"structural"` requests
  still route here.
- The narrative-doc tools + `auto-version.effect.ts` — already unified, untouched.

## Routing

- `buildScreenplayToolsGuidance` (`cesare.server.ts`): one rule — "any change to
  the TEXT of a single scene (add/cut/move/reword/anything) → edit_scene with the
  full new scene Fountain." Delete the propose_screenplay_edit line + the
  micro-vs-macro-by-size distinction. Keep merge/delete/revision/rename routing.
- Classifier: merge `micro_edit` into the scene-edit intent.
- `skills/screenplay-edit.skill.ts`: update guidance to match.

## Trade-offs (recorded)

- **Gain:** any scene-level act the writer phrases works; the fragile-anchor bug
  class (#83/#85/#86/#87) becomes structurally impossible; one apply path, one
  test surface for scene edits.
- **Cost — precision:** a one-word reword re-renders the whole scene green rather
  than a 3-word highlight. Accepted; `scope:"micro"` keeps the card copy honest.
- **Cost — not fully one system:** renames keep the bucket/decoration path
  (correctly — a rename IS global; a scene edit is scene-local). The facade
  unifies scene _revision_, not global rename. This asymmetry is correct, not
  debt.
- **Reversibility:** additive tool + prompt reroute; `propose_screenplay_edit`
  can be left dormant behind a flag as a bailout. Medium-reversible → this spec.

## Tests (OHW-80)

- **OHW-80-a** (unit): `edit_scene` on scene N applies the full new scene, preserves
  the scene number (reuses N2 coverage), anchors to the right scene (N1) — incl.
  an ADD case (new_content longer than original) and a CUT case.
- **OHW-80-b** (unit): `scope` is echoed to the result card; a `scope:"micro"`
  whose changed-word ratio is high is reported honestly (not silently downgraded).
- **OHW-80-c** (unit, retirement): `propose_screenplay_edit` is gone from the tool
  arrays / entity-map / classifier; `propose_rename_entity` still functions
  (bucket + decoration rename branch intact); the draft tools still function.
- **OHW-80-d** (E2E, real-AI smoke): the four acts that broke — add a character,
  reword, cut a line, reorder — each returns a whole-scene green preview on the
  RIGHT scene; accept/reject works; numbers preserved; names consistent (N4).

## Out of scope (follow-up cards)

- Multi-scene RANGE edits (`edit_scene` over from..to) — today >1 slugline is
  rejected; range stays with `propose_screenplay_revision`.
- Any cross-domain `rewrite_doc` facade over narrative/version worlds.
