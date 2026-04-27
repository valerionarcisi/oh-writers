# Clean Code Audit — 2026-04-24

Scope: `apps/web/app/features/**/{components,hooks,lib}`, `packages/ui/src/components`, `packages/domain/src`.
Priority: Clean Code is **#4**, subordinate to Ousterhout. Findings below are filtered to those that do not conflict with deep-modules / strategic-comments rules.

## Function smells

### Too long / multi-level (orchestration + state + side effects fused)

- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:65-460` — single component owns 12 `useState`, 8 `useEffect`, 7 `useCallback`, version-viewing state machine, conflict bus, toast bus, save-key handler, focus-mode bus, export-modal state. Could be decomposed into `useVersionViewing`, `useSceneNumberConflictBus`, `useSceneNumberToastBus`, `useSaveShortcut` without producing shallow modules — each hook hides a real, persistent concern.
- `apps/web/app/features/documents/components/NarrativeEditor.tsx:80-464` — 464-line component combining narrative editor, outline editor switch, AI panel, drawer wiring, three sibling `useDocument` calls (logline/synopsis/treatment) and an export-button-state computation (`allEmpty`, `contentFor`). The cross-document export gating is real domain logic that belongs in a hook.
- `apps/web/app/features/versions/components/VersionsList.tsx:50-539` — 539 lines, 8+ pieces of local state for create/rename/delete/duplicate/color-picker/date-picker, all flat. Picker sub-flows (`pendingColor`, `colorPickerFor`, `pendingDate`) could each be one hook.
- `apps/web/app/features/screenplay-editor/components/VersionsPanel.tsx:34-438` — duplicates much of VersionsList's create/rename/delete/color-picker state machine. The **same** state machine is implemented twice (once in `screenplay-editor`, once in `versions`). Real DRY violation, not premature.

### Too many args

None found. All multi-arg functions go through `Props` objects. Pure-function arities are ≤3.

## Naming

### Boolean prefix missing

- `apps/web/app/features/screenplay-editor/components/VersionsPanel.tsx:48` — `const [creating, setCreating] = useState(false)` → should be `isCreating`.
- `apps/web/app/features/versions/components/VersionsList.tsx:71` — `creating` should be `isCreating`. (Conflicts with prop also named `isCreating` — see misleading below.)
- `apps/web/app/features/projects/components/TitlePageForm.tsx:54` — `update` helper reads as a verb without subject; `updateField` would match the `set/add/remove` action-creator convention.
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:80,97` — discriminated-union state named `viewing` (noun) sits next to `isViewing` (boolean derived). `viewState` or `viewMode` would scan more clearly.

### Misleading

- `apps/web/app/features/versions/components/VersionsList.tsx:58` vs `:71` — prop `isCreating?: boolean` (server-pending) and local `creating: boolean` (UI-mode toggle) live in the same scope under near-identical names. One means "mutation in flight", the other "form is open". High confusion risk.
- `apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx:53` — `const imp = useImportPdf(...)`. Three-letter abbreviation in a 200+ line file; `importPdf` is unambiguous.
- `apps/web/app/features/screenplay-editor/lib/plugins/heading-nodeview.ts:53` — `const t = e.target as globalThis.Node | null;` — single-letter for a DOM node inside a 400-line class.
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:291` — `const t = window.setTimeout(...)`. Same single-letter timer alias.
- `apps/web/app/features/screenplay-editor/lib/diff.ts:22` — `const dmp = new diff_match_patch()`. Three-letter abbreviation; `differ` is clearer.

### Transformer prefix not applied

- `packages/domain/src/scene-heading.ts:70` — `const letters = (s: string): string => ...` is a normalizer that strips non-alphanumerics and uppercases. Reads as a noun. `toLetterKey` or `normalizeLetters` would match the `to/parse/format` rule and avoid shadowing the `letters` field of `SceneNumber`.

## Dead code

- None confirmed in scope. Two `// TODO: surface via shared toast` markers at `features/documents/components/SubjectEditor.tsx:171,175` are real placeholders using `window.alert`, not dead code — flag for follow-up.
- `features/documents/components/AuthorListField.tsx:1-2` — two i18n/promotion TODOs; tracked, not dead.

## Magic numbers (TS only)

- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:291` — `4000` (toast timeout) inline literal; should be `TOAST_DURATION_MS` at module top, mirroring the `AUTO_SAVE_DELAY_MS` pattern in `useScreenplay.ts`.
- `apps/web/app/features/screenplay-editor/lib/page-counter.ts:3,7` — `55` (lines per screenplay page) appears twice. Should be `LINES_PER_PAGE`. The header comment explains the rationale, but the literal repeats — a future rule change touches two sites.
- `apps/web/app/features/documents/components/NarrativeEditor.tsx:35` — `WORDS_PER_PAGE = 250` is named (good), but should arguably move to `packages/domain` since it's a domain assumption used to compute a user-visible number.

## Missing WHY comments (Ousterhout-mandatory)

- `apps/web/app/features/screenplay-editor/hooks/useScreenplay.ts:111` — `eslint-disable-next-line react-hooks/exhaustive-deps` on `flush` with no rationale (the analogous `:101` disable is justified by the comment at :100). Why is `save` excluded from `flush`'s deps?
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:178` — `eslint-disable-next-line react-hooks/exhaustive-deps` after the version-prefetch effect. No comment explains why `viewing`, `content`, `pmDoc` are intentionally excluded — and they really are: re-running on a keystroke would re-enter view mode mid-typing. Non-obvious invariant.
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:240-247` — the `__ohWritersForceSave` window hook is documented as "E2E test hook" but does not explain _why_ the production bundle ships it. Test-only globals leaking into prod is unusual; one-line rationale would close the question.

## Noted but acceptable

- `ScreenplayEditor.tsx:49-63` — `countHeadings` walks PM doc JSON with a nested helper and a let-counter. Not pure-functional, but the comment at :49 explains the cheap-recursion choice. Keep.
- `packages/domain/src/scene-numbers.ts:233-294` — `resequenceAll` is ~60 lines with two passes and a try/catch around a thrown `ResequenceConflictError`. Long, but each block is one level of abstraction (validate locked → fill gaps), and the throw/catch is internal-only. Keep.
- `ScreenplayToolbarProps` (16 fields) — Clean Code would split. Ousterhout overrides: a smaller component would just pass these through. Keep.
- `VersionsListProps` (18 fields) — same justification.

## Positive patterns

- Tagged const objects for enums — `SaveStatusValues`, `DocumentTypes`, `TeamRoles`, `BREAKDOWN_CATEGORIES` consistently used; switch/if-else avoided.
- Zod-inferred types throughout (`TitlePage`, `SaveScreenplayData`).
- `packages/domain/src/scene-numbers.ts` and `scene-heading.ts` are exemplary deep modules: rich JSDoc, pure functions, tagged error class with `_tag`, clear domain vocabulary, no React/PM imports.
- Strategic why-comments at non-obvious sites: `useScreenplay.ts:74-75` (online/offline rationale), `ScreenplayEditor.tsx:127-132` (optimistic highlight), `NarrativeEditor.tsx:122-123` (version-reload key choice), `page-counter.ts:1` (industry convention).
- Action creators and reducers use `setX/addX/removeX` consistently.
- Boolean props uniformly prefixed `is/has/can/show` (~95% of scanned files).
