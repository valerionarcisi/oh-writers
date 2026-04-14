# Spec 05e — Screenplay Editor UX (StudioBinder/Final Draft Parity)

Research findings from StudioBinder, Final Draft, and Fade In editors. Goal: the writing experience in Oh Writers should feel like writing in a professional screenplay app, not a code editor.

---

## Element Types

Seven standard screenplay elements, each with specific formatting rules.

| Element       | Left Margin (in) | Right Margin (in) | Width (in) | Caps             | Alignment       |
| ------------- | ---------------- | ----------------- | ---------- | ---------------- | --------------- |
| Scene Heading | 1.5              | 1.0               | 6.0        | ALL CAPS         | Left            |
| Action        | 1.5              | 1.0               | 6.0        | Sentence case    | Left            |
| Character     | 4.2              | 1.0               | 3.3        | ALL CAPS         | Left (indented) |
| Parenthetical | 3.6              | 2.9               | 2.0        | Lowercase, in () | Left (indented) |
| Dialogue      | 2.9              | 2.3               | 3.3        | Sentence case    | Left (indented) |
| Transition    | 6.0              | 1.0               | 1.5        | ALL CAPS         | Right           |
| General/Shot  | 1.5              | 1.0               | 6.0        | ALL CAPS         | Left            |

Font: Courier Prime, 12pt. Page: 8.5" x 11" equivalent. 55 lines per page (already implemented).

---

## Tab / Enter Element Flow

The core writing interaction. After completing an element and pressing Enter or Tab, the editor automatically switches to the next expected element type.

### Enter behavior (confirm current element, go to next expected)

| Current Element | Enter produces           |
| --------------- | ------------------------ |
| Scene Heading   | Action                   |
| Action          | Action (new paragraph)   |
| Character       | Dialogue                 |
| Parenthetical   | Dialogue                 |
| Dialogue        | Character (next speaker) |
| Transition      | Scene Heading            |
| General/Shot    | Action                   |

### Tab behavior (switch to alternative element)

| Current Element | Tab produces                 |
| --------------- | ---------------------------- |
| Action          | Character                    |
| Character       | Parenthetical                |
| Parenthetical   | Dialogue                     |
| Dialogue        | Action (exit dialogue block) |

### Empty line Enter

Pressing Enter on a completely empty line opens a **dropdown menu** showing all element types. User selects with arrow keys + Enter. This is the escape hatch when the automatic flow doesn't match what the writer needs.

---

## Keyboard Shortcuts (Direct Element Switch)

Bypass the flow — jump directly to any element type. Two shortcut schemes supported (StudioBinder uses both):

### Number shortcuts (StudioBinder primary — observed from toolbar menus)

| Mac   | PC       | Element       |
| ----- | -------- | ------------- |
| ⌘ + 1 | Ctrl + 1 | Scene Heading |
| ⌘ + 2 | Ctrl + 2 | Action        |
| ⌘ + 3 | Ctrl + 3 | Character     |
| ⌘ + 4 | Ctrl + 4 | Dialogue      |
| ⌘ + 5 | Ctrl + 5 | Parenthetical |
| ⌘ + 6 | Ctrl + 6 | Transition    |
| ⌘ + 7 | Ctrl + 7 | Shot/General  |

### Alt+letter shortcuts (alternative scheme)

| Mac   | PC      | Element       |
| ----- | ------- | ------------- |
| ⌥ + S | Alt + S | Scene Heading |
| ⌥ + A | Alt + A | Action        |
| ⌥ + C | Alt + C | Character     |
| ⌥ + D | Alt + D | Dialogue      |
| ⌥ + P | Alt + P | Parenthetical |
| ⌥ + T | Alt + T | Transition    |
| ⌥ + G | Alt + G | General/Shot  |

### Standard editing shortcuts

| Mac           | PC               | Action    |
| ------------- | ---------------- | --------- |
| ⌘ + B         | Ctrl + B         | Bold      |
| ⌘ + I         | Ctrl + I         | Italic    |
| ⌘ + U         | Ctrl + U         | Underline |
| ⌘ + Z         | Ctrl + Z         | Undo      |
| ⌘ + Shift + Z | Ctrl + Shift + Z | Redo      |

---

## Auto-Complete

### Character names

After switching to Character element, typing shows a dropdown of previously used character names. Selection with arrow keys + Enter or Tab. Characters are extracted from the screenplay content.

### Scene headings

After switching to Scene Heading, typing the first few characters of INT/EXT shows completion. After the prefix, location names from previous scene headings are suggested.

### Extensions

When on a Character element, typing `(` after the character name shows extension suggestions:

- (V.O.) — voice over
- (O.S.) — off screen
- (O.C.) — off camera
- (CONT'D) — continued
- (INTO PHONE) — into device
- (PRE-LAP) — pre-lap

### Transitions

When on a Transition element, common transitions are suggested:

- CUT TO:
- FADE IN:
- FADE OUT.
- FADE TO:
- DISSOLVE TO:
- SMASH CUT TO:
- MATCH CUT TO:

---

## Auto-Formatting Rules

1. **Scene Heading**: auto-capitalize everything. Auto-insert `INT.` or `EXT.` prefix when typing starts. Enforce format: `INT./EXT. LOCATION - TIME`
2. **Character**: auto-capitalize the name
3. **Transition**: auto-capitalize, right-align
4. **Parenthetical**: auto-wrap in `()` if user doesn't type them
5. **Dialogue**: normal sentence case
6. **Action**: normal sentence case, auto-capitalize first word after scene heading

---

## Toolbar (StudioBinder Reference)

The toolbar uses **icon buttons** for each element type, not text labels. This saves horizontal space and is scannable once learned.

### Icon bar (left to right, observed from StudioBinder)

| Position | Icon                 | Element       | Description           |
| -------- | -------------------- | ------------- | --------------------- |
| 1        | Triangle/mountain    | Scene Heading | Location marker feel  |
| 2        | Flag/clapboard       | Action        | Action indicator      |
| 3        | Megaphone            | Character     | Speaking indicator    |
| 4        | Theatre mask         | Dialogue      | Performance indicator |
| 5        | `(=)` parentheses    | Parenthetical | Literal symbol        |
| 6        | Bidirectional arrows | Transition    | Movement indicator    |
| 7        | Angle brackets `</>` | Shot/General  | Camera/technical      |

### Toolbar behavior

- The **active element** has a colored underline indicator (blue in StudioBinder)
- Clicking an icon **switches the current line** to that element type
- Hovering shows a tooltip with the element name + keyboard shortcut
- A **lock icon** (rightmost, orange) toggles read-only mode
- A **hamburger menu** gives access to additional options

### Element indicator

The active element is always visible — the writer always knows which mode they're in. We implement this with the underline on the active toolbar icon + a text badge in the status area.

### Save status

"Done Saving" / "Saving..." appears briefly in the toolbar area — non-intrusive, auto-dismissing. Matches our existing `SaveStatus` component pattern.

## Inline Element Picker (Enter on Empty Line)

Pressing Enter on an empty line opens an **inline dropdown** directly in the text (not in the toolbar). The dropdown shows:

```
[S] SCENE
[A] ACTION
[C] CHARACTER
[P] PARENTHETICAL
[D] DIALOGUE
[T] TRANSITION
[G] GENERAL
```

- Each item has a letter prefix for quick selection (type the letter to jump)
- The dropdown is filterable — typing narrows the options
- Arrow keys + Enter to select
- Escape to dismiss
- The dropdown appears at the cursor position, inline with the text

This is the **primary discovery mechanism** for new users — they don't need to memorize shortcuts to find all element types.

---

## Current Oh Writers Implementation vs Target

| Feature                 | Current (Spec 05-05d)                     | Target (this spec)                          |
| ----------------------- | ----------------------------------------- | ------------------------------------------- |
| Tab cycling             | Basic (between a few elements)            | Full matrix per table above                 |
| Enter flow              | Smart Enter for CHARACTER→DIALOGUE→ACTION | Full matrix per table above                 |
| Empty line dropdown     | Not implemented                           | Inline element picker (filterable)          |
| Ctrl+Number shortcuts   | Not implemented                           | ⌘/Ctrl + 1-7 for each element               |
| Alt+Letter shortcuts    | Not implemented                           | Alt + S/A/C/D/P/T/G                         |
| Icon toolbar            | Not implemented                           | 7 icon buttons with active indicator        |
| Character autocomplete  | Implemented (Spec 05d)                    | Keep, refine — dropdown with all used names |
| Location autocomplete   | Implemented (Spec 05d)                    | Keep, refine suggestions                    |
| Extension autocomplete  | Not implemented                           | Add (V.O., O.S., CONT'D, etc.)              |
| Transition autocomplete | Not implemented                           | Add common transitions                      |
| Parenthetical auto-wrap | Not implemented                           | Add () auto-wrap                            |
| Element indicator       | Implemented (text badge)                  | Icon toolbar with underline indicator       |
| Margins per element     | Approximate                               | Match spec exactly                          |
| Bold/Italic/Underline   | Not implemented                           | Add toolbar + shortcuts                     |
| Save status             | Implemented                               | Keep — "Saving..." / "Saved" in toolbar     |
| Lock/read-only mode     | Not implemented                           | Add lock toggle in toolbar                  |
| Scene numbers           | Not implemented                           | Add in left margin                          |
| Page numbers            | Partial (page count)                      | Add per-page number in right margin         |

---

## UX Philosophy

The writing experience should feel like:

- **Writing in Word** — familiar keyboard interactions, no learning curve
- **With professional formatting** — the software handles margins, caps, indentation
- **With intelligent autocomplete** — characters, locations, extensions predicted from context
- **Without interruption** — Tab and Enter flow keeps you in the writing zone, no mouse needed

The writer should be able to write an entire screenplay without touching the mouse after the first scene heading.

---

## Page Appearance (StudioBinder Reference)

The screenplay page must feel like a real sheet of paper floating on a dark desk. White, centered, with generous margins and readable font size.

### Page container

- **White page** (`#ffffff`) centered horizontally on dark editor background (`#0d0d0d`)
- **Zero border-radius** — sharp corners, like real paper
- **Subtle shadow** (`--shadow-lg`) to lift the page off the background
- **Max width** ~816px (8.5" at 96dpi) — the page does not stretch to fill the viewport
- **Generous internal padding** matching screenplay margin specs: 1.5" left, 1" right, 1" top/bottom
- **Vertical scroll** — continuous page, page breaks indicated by a thin separator line

### Font size

**Courier Prime at 15px minimum** — readable without zooming. StudioBinder uses a size comfortable for long writing sessions, larger than strict 12pt Courier but maintaining the correct line-per-page ratio. The page width + font size together determine the 55-lines-per-page rule.

### Content formatting

- **Scene numbers** visible in the left margin (e.g., `1`) — outside the action text block
- **Page numbers** top right of each page
- **Scene heading**: `1  INT/EXT. LOCATION - TIME    page#` — number left, page right
- **Character names** ALL CAPS, indented (4.2" from left)
- **Parentheticals** in `()`, indented under character name (3.6" from left)
- **Dialogue** indented (2.9" from left), narrower than action
- **Transitions** right-aligned (6" from left)
- **Vertical spacing**: one blank line before scene headings, no blank line between character/dialogue

### Above the page

A **notification bar** above the page for status messages ("Unsaved Changes", version info). Sits between the toolbar and the page, on the dark background — not inside the white page area.

### Version navigation

Versions are accessed from the **left sidebar** as a sub-menu under each document (see Spec 06b). Not a separate panel.

---

## Implementation Priority

1. **Full Tab/Enter flow matrix** — the biggest UX improvement
2. **Alt+Key direct element shortcuts** — power user efficiency
3. **Empty line dropdown** — escape hatch for the flow
4. **Extension autocomplete** (V.O., O.S., CONT'D)
5. **Transition autocomplete**
6. **Bold/Italic/Underline** — toolbar + shortcuts
7. **Exact margins per element** — visual polish
8. **Parenthetical auto-wrap**

---

## Sources

- [StudioBinder Keyboard Shortcuts](https://support.studiobinder.com/en/articles/2922070-screenwriting-keyboard-shortcuts)
- [StudioBinder Screenplay Elements](https://support.studiobinder.com/en/articles/2941370-screenplay-elements)
- [StudioBinder Parenthetical Formatting](https://support.studiobinder.com/en/articles/3050930-best-practices-when-formatting-a-parenthetical-in-a-screenplay)
- [Final Draft Formatting Elements](https://www.finaldraft.com/learn/screenplay-formatting-elements/)
- [Fade In Element Flow](https://writersterritory.com/2016/09/how-to-use-screenplay-formatting-elements-in-fade-in/)
- [Screenplay Margins — Story Sense](https://www.storysense.com/format/margins.htm)
- [Screenplay Margins — StudioBinder](https://www.studiobinder.com/blog/screenplay-margins/)
