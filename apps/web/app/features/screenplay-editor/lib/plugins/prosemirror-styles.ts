/**
 * Inject global CSS for ProseMirror node classes.
 *
 * ProseMirror writes DOM nodes directly (not through React), so their classes
 * bypass CSS Modules. We inject a single <style> tag with the physical-page
 * layout rules using the lowercase kebab-case class names that `toDOM`
 * emits: `pm-heading`, `pm-action`, `pm-character`, etc.
 *
 * Values in `in` units match the industry-standard screenplay format.
 * These numbers are intentional constants — not CSS variables.
 */
export const injectProseMirrorStyles = (): void => {
  // Remove any existing tag first so HMR edits to this file are picked up.
  // In production the tag is written once per page load (the selector finds
  // nothing on subsequent PM mounts within the same SPA navigation anyway).
  document.querySelector("[data-pm-screenplay-styles]")?.remove();

  const style = document.createElement("style");
  style.setAttribute("data-pm-screenplay-styles", "true");
  // All selectors are scoped under `[data-pm-screenplay]` (set on the mount
  // div in ProseMirrorView) so the screenplay's page-format rules can't leak
  // to other ProseMirror instances on the page (e.g. the narrative editor),
  // which would otherwise inherit the 1.5in/1in inline padding and shrink.
  style.textContent = `
    /* ─── ProseMirror editor root ──────────────────────────── */

    [data-pm-screenplay] .ProseMirror {
      font-family: "Courier Prime", "Courier New", Courier, monospace;
      font-size: 12pt;
      line-height: 1;
      color: #111;
      caret-color: #111;
      outline: none;
      padding-inline: 1.5in 1in;
      padding-block: 1in;
      min-block-size: 11in;
    }

    /* No shared margin reset here — browser defaults for p/h2 are small and
     * each element class sets its own margins explicitly below. A grouped reset
     * with higher specificity (.ProseMirror .pm-x) would silently override the
     * per-element margin-inline-start values on character/dialogue/parenthetical. */

    /* ─── Scene ─────────────────────────────────────────────── */

    .pm-scene {
      display: block;
    }

    /* ─── Heading — bold, uppercase ─────────────────────────── */

    .pm-heading {
      display: block;
      position: relative; /* anchors the absolutely-positioned scene-number buttons */
      font-weight: 700;
      text-transform: uppercase;
      /* Industry convention: scene heading is the same body font-size, only
       * differentiated by weight + caps. The <h2> tag is semantic; we override
       * the browser default heading size to keep the page monospaced-uniform. */
      font-size: inherit;
      line-height: inherit;
      margin-inline: 0;
      margin-block-start: 2em;
      margin-block-end: 1em;
    }

    /* Flex wrapper that holds prefix + title. This is the NodeView's
     * contentDOM — PM writes the two inline slots here. */
    .pm-heading-slots {
      display: flex;
      align-items: baseline;
      gap: 1ch;
    }

    .pm-scene:first-child .pm-heading {
      margin-block-start: 0;
    }

    /* ─── Heading slots — prefix + title ─────────────────────── */
    /*
     * Each slot is its own PM textblock (block <p>) so an empty slot owns
     * its trailing BR and PM's DOM→state input mapping can't merge typed
     * characters into a sibling slot. The flex parent lays them out on the
     * same line; gap:1ch provides the visual separator without a literal
     * space in the data.
     */

    .pm-heading-prefix,
    .pm-heading-title {
      display: inline-block;
      margin: 0;
      padding: 0;
      min-inline-size: 1ch; /* keeps empty slot clickable + cursor visible */
    }

    /* Visual separator between prefix and title — a non-breaking space injected
     * via ::before on the title slot. The data stays clean (no literal space in
     * the PM doc); the flex gap adds the rendering separation. The ::before is
     * present so tests can verify the separator exists via getComputedStyle. */
    .pm-heading-title::before {
      content: " ";
    }

    /* ─── Scene numbers — real <button> elements rendered by the NodeView ── */
    /*
     * Each heading NodeView renders two <button.scene-number> siblings of its
     * contentDOM, one on each gutter, so the user can click to edit. Both are
     * absolutely positioned relative to .pm-heading so they don't affect the
     * flex layout of the slots wrapper. Offsets mirror the old pseudo-element
     * rules (tuned to the .ProseMirror 1.5in / 1in padding-inline).
     */

    .pm-heading .scene-number-btn {
      position: absolute;
      top: 0;
      padding: 0;
      border: 0;
      background: transparent;
      font-family: "Courier Prime", "Courier New", Courier, monospace;
      font-weight: 700;
      font-size: 12pt;
      line-height: inherit;
      color: #555;
      cursor: pointer;
      user-select: none;
    }

    .pm-heading .scene-number-btn:hover {
      color: #111;
      text-decoration: underline;
    }

    .pm-heading .scene-number-btn.is-locked {
      color: #0b57d0;
    }

    /* Lock glyph — tells the writer "this number is protected from
       Ricalcola". Rendered inline after the number so it follows wherever
       the number sits (left/right gutter, narrow screens). */
    .pm-heading .scene-number-btn.is-locked::after {
      content: " 🔒";
      font-size: 9pt;
      opacity: 0.75;
    }

    .pm-heading .scene-number-btn[hidden] {
      display: none;
    }

    .pm-heading .scene-number-left {
      left: -1in;
    }

    .pm-heading .scene-number-right {
      right: -0.75in;
    }

    /* Inline edit input — replaces the left button while editing. */
    .pm-heading .scene-number-input {
      position: absolute;
      top: 0;
      left: -1in;
      inline-size: 4ch;
      padding: 0 2px;
      border: 1px solid #0b57d0;
      background: #fff;
      font-family: "Courier Prime", "Courier New", Courier, monospace;
      font-weight: 700;
      font-size: 12pt;
      line-height: inherit;
      color: #111;
      text-transform: uppercase;
    }

    /* ⋮ button next to the left scene number — opens the scene popover. */
    .pm-heading .scene-number-menu-btn {
      position: absolute;
      top: 0;
      left: -0.55in;
      padding: 0 2px;
      border: 0;
      background: transparent;
      font: inherit;
      font-weight: 700;
      color: #888;
      cursor: pointer;
      user-select: none;
    }

    .pm-heading .scene-number-menu-btn:hover {
      color: #111;
    }

    .pm-heading .scene-menu {
      position: absolute;
      top: 1.6em;
      left: -1in;
      z-index: 10;
      inline-size: 12em;
      padding: 4px 0;
      background: #fff;
      border: 1px solid #d0d0d0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      display: flex;
      flex-direction: column;
      font-family: system-ui, sans-serif;
      font-weight: 400;
      font-size: 10pt;
      text-transform: none;
      color: #111;
    }

    .pm-heading .scene-menu-item {
      text-align: start;
      padding: 6px 10px;
      background: transparent;
      border: 0;
      cursor: pointer;
      font: inherit;
      color: inherit;
    }

    .pm-heading .scene-menu-item:hover:not(:disabled) {
      background: #f0f0f0;
    }

    .pm-heading .scene-menu-item:disabled {
      color: #aaa;
      cursor: not-allowed;
    }

    .pm-heading .scene-menu-divider {
      margin: 4px 0;
      border: 0;
      border-block-start: 1px solid #e5e5e5;
    }

    .pm-heading .scene-number-error {
      position: absolute;
      top: 1.6em;
      left: -1in;
      max-inline-size: 2in;
      font-family: system-ui, sans-serif;
      font-weight: 400;
      font-size: 10pt;
      line-height: 1.2;
      color: #c0392b;
      text-transform: none;
    }

    /* ─── Action — full width ───────────────────────────────── */

    .pm-action {
      display: block;
      margin-inline: 0;
      margin-block-start: 0;
      margin-block-end: 1em;
    }

    /* ─── Character cue — ~3.7" from page left (2.2" from 1.5" margin) */

    .pm-character {
      display: block;
      text-transform: uppercase;
      margin-inline-start: 2.2in;
      margin-block-start: 1em;
      margin-block-end: 0;
    }

    /* ─── Parenthetical — italic, indented ─────────────────── */

    .pm-parenthetical {
      display: block;
      font-style: italic;
      margin-inline-start: 1.6in;
      max-inline-size: 2in;
    }

    /* ─── Dialogue — narrow column, centered (Italian convention) ─ */

    .pm-dialogue {
      display: block;
      max-inline-size: 3.5in;
      margin-inline: auto;
      font-style: normal;
    }

    /* ─── Transition — flush right ──────────────────────────── */

    .pm-transition {
      display: block;
      text-transform: uppercase;
      text-align: end;
      margin-inline: 0;
      margin-block: 1em;
    }

    /* ─── ProseMirror selection & placeholder ───────────────── */

    .ProseMirror-selectednode {
      outline: none;
    }

    .ProseMirror .pm-action:empty::before,
    .ProseMirror .pm-character:empty::before,
    .ProseMirror .pm-dialogue:empty::before,
    .ProseMirror .pm-parenthetical:empty::before,
    .ProseMirror .pm-transition:empty::before,
    .ProseMirror .pm-heading:empty::before {
      content: attr(data-placeholder);
      color: #bbb;
      pointer-events: none;
    }

    /* Focused empty block placeholder */
    .ProseMirror:focus .pm-action.ProseMirror-focused:empty::before {
      content: "Action…";
    }
  `;

  document.head.appendChild(style);
};
