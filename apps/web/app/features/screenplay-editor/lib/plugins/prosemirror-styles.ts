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
  if (document.querySelector("[data-pm-screenplay-styles]")) return;

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

    .ProseMirror :is(
      .pm-heading,
      .pm-action,
      .pm-character,
      .pm-dialogue,
      .pm-parenthetical,
      .pm-transition
    ) {
      margin: 0;
    }

    /* ─── Scene ─────────────────────────────────────────────── */

    .pm-scene {
      display: block;
    }

    /* ─── Heading — bold, uppercase ─────────────────────────── */

    .pm-heading {
      display: block;
      font-weight: 700;
      text-transform: uppercase;
      margin-block-start: 2em;
      margin-block-end: 1em;
    }

    .pm-scene:first-child .pm-heading {
      margin-block-start: 0;
    }

    /* ─── Action — full width ───────────────────────────────── */

    .pm-action {
      display: block;
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

    /* ─── Dialogue — narrow column ──────────────────────────── */

    .pm-dialogue {
      display: block;
      margin-inline-start: 1in;
      max-inline-size: 3.5in;
    }

    /* ─── Transition — flush right ──────────────────────────── */

    .pm-transition {
      display: block;
      text-transform: uppercase;
      text-align: end;
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
