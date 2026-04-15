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
  style.textContent = `
    /* ─── ProseMirror editor root ──────────────────────────── */

    .ProseMirror {
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
      display: flex;
      align-items: baseline;
      gap: 1ch;
      position: relative; /* anchors ::before / ::after pseudo-elements */
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

    /* ─── Scene numbers — CSS pseudo-elements on data-number attr ── */
    /*
     * The heading node's scene_number attr is emitted as data-number by the
     * schema's toDOM. ::before = left gutter, ::after = right gutter.
     * Positioned relative to .pm-heading which is position:relative.
     * Offsets are tuned to the .ProseMirror padding-inline (1.5in left / 1in right):
     *   left gutter  sits ~0.5in from page edge → left: -1in from text start
     *   right gutter sits ~0.5in from right edge → right: -0.75in from text end
     */

    .pm-heading[data-number]::before,
    .pm-heading[data-number]::after {
      content: attr(data-number);
      position: absolute;
      top: 0;
      font-family: "Courier Prime", "Courier New", Courier, monospace;
      font-weight: 700;
      font-size: 12pt;
      line-height: inherit;
      color: #555;
      user-select: none;
      pointer-events: none;
    }

    .pm-heading[data-number]::before {
      left: -1in;
    }

    .pm-heading[data-number]::after {
      right: -0.75in;
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
