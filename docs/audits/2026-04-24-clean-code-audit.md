# Clean Code Audit — 2026-04-24 (post-cleanup)

Scope: `apps/web/app/features/**/{components,hooks,lib}`, `packages/ui/src/components`, `packages/domain/src`.
Priority: Clean Code is **#4**, subordinate to Ousterhout. Findings filtered to those that do not conflict with deep-modules / strategic-comments rules.

Re-run vs. prior audit (2026-04-24 baseline): no full refactor sweep landed on the listed smells. Only one prior item is resolved (SubjectEditor `window.alert` TODOs at lines 171/175 — file no longer contains TODO markers). All other findings re-confirmed against current line numbers.

## Function smells

### Too long / multi-level

- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:65-464` — single component still owns 12 `useState`, 8 `useEffect`, 7 `useCallback`, version-viewing state machine, conflict bus, toast bus, save-key handler, focus-mode bus, export-modal state. Decomposition into `useVersionViewing`, `useSceneNumberConflictBus`, `useSceneNumberToastBus`, `useSaveShortcut` would each hide a real persistent concern (deep, not shallow).
- `apps/web/app/features/documents/components/NarrativeEditor.tsx:80-464` — 464-line component combining narrative editor, outline editor switch, AI panel, drawer wiring, three sibling `useDocument` calls (logline/synopsis/treatment), and a cross-document export-button gating computation (`allEmpty`, `contentFor`). Export gating is real domain logic; belongs in a hook.
- `apps/web/app/features/versions/components/VersionsList.tsx:50-536` — 536 lines, 8+ pieces of local state for create/rename/delete/duplicate/color-picker/date-picker, all flat. Sub-flows (`pendingColor`, `colorPickerFor`, `pendingDate`) could each be one hook.
- `apps/web/app/features/screenplay-editor/components/VersionsPanel.tsx:34-435` — duplicates much of VersionsList's create/rename/delete/color-picker state machine. The **same** state machine is implemented twice. Real DRY violation, not premature.

### Too many args

None found. All multi-arg functions go through `Props` objects. Pure-function arities ≤ 3.

## Naming

### Boolean prefix missing

- `apps/web/app/features/screenplay-editor/components/VersionsPanel.tsx:45` — `const [creating, setCreating] = useState(false)` → should be `isCreating`.
- `apps/web/app/features/versions/components/VersionsList.tsx:68` — `const [creating, setCreating]` → should be `isCreating`. Also collides with prop `isCreating` in same scope (see misleading).
- `apps/web/app/features/projects/components/TitlePageForm.tsx:54` — `update` helper reads as a verb without subject; `updateField` matches the project's `set/add/remove` action-creator convention.
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx` — discriminated-union state named `viewing` (noun) sits next to `isViewing` (boolean derived). `viewState` or `viewMode` scans more clearly.

### Misleading

- `apps/web/app/features/versions/components/VersionsList.tsx:31` vs `:68` — prop `isCreating?: boolean` (server-pending mutation) and local `creating: boolean` (UI-mode toggle) live in the same scope under near-identical names. One means "mutation in flight", the other "form is open". High confusion risk.
- `apps/web/app/features/screenplay-editor/components/ToolbarMenu.tsx:53` — `const imp = useImportPdf(...)`. Three-letter abbreviation in a 272-line file; `importPdf` is unambiguous.
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:295` — `const t = window.setTimeout(...)`. Single-letter timer alias.
- `apps/web/app/features/screenplay-editor/lib/diff.ts:22` — `const dmp = new diff_match_patch()`. Three-letter abbreviation; `differ` is clearer.
- `packages/domain/src/scene-heading.ts:134` — `const t = letters(typed.trim());` — single-letter variable inside a domain pure function.

### Transformer prefix not applied

- `packages/domain/src/scene-heading.ts:70` — `const letters = (s: string): string => ...` is a normalizer (strips non-alphanumerics + uppercases). Reads as a noun. `toLetterKey` or `normalizeLetters` would match the `to/parse/format` rule and avoid shadowing the `letters` field of `SceneNumber`.

## Dead code

- None confirmed in scope. Prior audit's two `// TODO: surface via shared toast` markers in `SubjectEditor.tsx:171,175` are **resolved** (file no longer contains them).
- `features/documents/components/AuthorListField.tsx:1-2` — two i18n/promotion TODOs; tracked, not dead.

## Magic numbers (TS only)

- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:295` — `4000` (toast timeout) inline literal; should be `TOAST_DURATION_MS` at module top, mirroring the `AUTO_SAVE_DELAY_MS` pattern in `useScreenplay.ts`.
- `apps/web/app/features/screenplay-editor/lib/page-counter.ts:3,7` — `55` (lines per screenplay page) appears twice. Should be `LINES_PER_PAGE`. Header comment explains rationale, but a future rule change touches two sites.
- `apps/web/app/features/documents/components/NarrativeEditor.tsx:35` — `WORDS_PER_PAGE = 250` is named (good) but is a domain assumption used to compute a user-visible number; arguably belongs in `packages/domain`.

## Missing WHY comments (Ousterhout-mandatory)

- `apps/web/app/features/screenplay-editor/hooks/useScreenplay.ts:111` — `eslint-disable-next-line react-hooks/exhaustive-deps` on `flush` with no rationale (analogous `:101` disable IS justified by comment). Why is `save` excluded from `flush`'s deps?
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx` — version-prefetch effect's `eslint-disable-next-line react-hooks/exhaustive-deps` has no comment explaining why `viewing`, `content`, `pmDoc` are intentionally excluded — re-running on a keystroke would re-enter view mode mid-typing. Non-obvious invariant.
- `apps/web/app/features/screenplay-editor/components/ScreenplayEditor.tsx:240-247` — `__ohWritersForceSave` window hook documented as "E2E test hook" but does not explain _why_ the production bundle ships it. Test-only globals leaking into prod is unusual; one-line rationale would close the question.

## Noted but acceptable

- `ScreenplayEditor.tsx` `countHeadings` walks PM doc JSON with a nested helper and a let-counter. Not pure-functional, but the inline comment explains the cheap-recursion choice. Keep.
- `packages/domain/src/scene-numbers.ts` `resequenceAll` is ~60 lines with two passes and an internal try/catch around `ResequenceConflictError`. Long, but each block is one level of abstraction. Keep.
- `ScreenplayToolbarProps` (16 fields) and `VersionsListProps` (18 fields) — Clean Code would split. Ousterhout overrides: a smaller component would just pass these through. Keep.

## Positive patterns

- Tagged const objects for enums — `SaveStatusValues`, `DocumentTypes`, `TeamRoles`, `BREAKDOWN_CATEGORIES` consistently used; switch/if-else avoided.
- Zod-inferred types throughout (`TitlePage`, `SaveScreenplayData`).
- `packages/domain/src/scene-numbers.ts` and `scene-heading.ts` are exemplary deep modules: rich JSDoc, pure functions, tagged error class with `_tag`, clear domain vocabulary, no React/PM imports.
- Strategic why-comments at non-obvious sites: `useScreenplay.ts:74-75` (online/offline rationale), `ScreenplayEditor.tsx` (optimistic highlight), `NarrativeEditor.tsx` (version-reload key choice), `page-counter.ts:1` (industry convention).
- Action creators and reducers use `setX/addX/removeX` consistently.
- Boolean props uniformly prefixed `is/has/can/show` (~95% of scanned files).
- SubjectEditor `window.alert` TODOs from prior audit are now resolved.
