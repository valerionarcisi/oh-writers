import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import {
  extractCharacterNames,
  extractLocations,
} from "../fountain-autocomplete";
import { FOUNTAIN_TRANSITIONS, SCENE_HEADING_RE } from "../fountain-constants";
import { docToFountain } from "../doc-to-fountain";
import {
  reducer,
  initialState,
  type AutocompleteState,
} from "./autocomplete-reducer";

const pluginKey = new PluginKey<null>("autocomplete");

/**
 * Compute suggestions for the block at the current cursor.
 * Pure — reads state only, no side effects.
 */
const computeSuggestions = (state: EditorState): string[] => {
  const { $from } = state.selection;
  const blockType = $from.parent.type.name;
  const blockText = $from.parent.textContent;

  if (blockType === "character") {
    const fountain = docToFountain(state.doc);
    const typed = blockText.toUpperCase();
    const names = extractCharacterNames(fountain);
    return names.filter((n) => n.startsWith(typed) && n !== typed);
  }

  if (blockType === "heading" && SCENE_HEADING_RE.test(blockText)) {
    const fountain = docToFountain(state.doc);
    const after = blockText.replace(SCENE_HEADING_RE, "").toUpperCase();
    return extractLocations(fountain).filter(
      (loc) => loc.startsWith(after) && loc !== after,
    );
  }

  if (blockType === "transition") {
    const typed = blockText.toUpperCase();
    return FOUNTAIN_TRANSITIONS.filter(
      (t) => t.startsWith(typed) && t !== typed,
    );
  }

  return [];
};

class AutocompleteDropdown {
  private el: HTMLUListElement;
  private state: AutocompleteState = initialState;

  constructor(private readonly view: EditorView) {
    this.el = document.createElement("ul");
    this.el.setAttribute("role", "listbox");
    this.el.style.cssText = [
      "position:fixed",
      "background:#1e1c1b",
      "border:1px solid #3a3836",
      "border-radius:4px",
      "padding:4px 0",
      "margin:0",
      "list-style:none",
      "z-index:9999",
      "min-width:180px",
      "max-height:200px",
      "overflow-y:auto",
      "box-shadow:0 4px 16px rgba(0,0,0,.4)",
      "display:none",
      "font-family:'Courier Prime','Courier New',Courier,monospace",
      "font-size:11pt",
    ].join(";");

    this.el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const li = (e.target as HTMLElement).closest("li");
      if (li?.dataset.index !== undefined) {
        this.applyAt(Number(li.dataset.index));
      }
    });

    document.body.appendChild(this.el);
  }

  update(editorState: EditorState) {
    const suggestions = computeSuggestions(editorState);
    const next = reducer(this.state, {
      type: "suggestions/compute",
      suggestions,
    });
    if (next === this.state) return;
    this.state = next;
    this.render(editorState);
  }

  private render(editorState: EditorState) {
    if (this.state.tag === "hidden") {
      this.el.style.display = "none";
      return;
    }

    const { suggestions } = this.state;
    this.el.innerHTML = "";
    suggestions.forEach((s, i) => {
      const li = document.createElement("li");
      li.textContent = s;
      li.dataset.index = String(i);
      li.setAttribute("role", "option");
      li.style.cssText =
        "padding:4px 12px;cursor:pointer;color:#d4d0cc;white-space:nowrap";
      li.addEventListener("mouseover", () => {
        this.state = reducer(this.state, { type: "nav/set", index: i });
        this.highlightSelected();
      });
      this.el.appendChild(li);
    });

    this.highlightSelected();
    this.reposition(editorState);
    this.el.style.display = "block";
  }

  private highlightSelected() {
    const idx = this.state.tag === "visible" ? this.state.selectedIndex : -1;
    this.el.querySelectorAll("li").forEach((li, i) => {
      (li as HTMLElement).style.background =
        i === idx ? "#2e2b29" : "transparent";
    });
  }

  private reposition(editorState: EditorState) {
    const { from } = editorState.selection;
    const coords = this.view.coordsAtPos(from);
    const dropH = this.el.offsetHeight || 200;
    const spaceBelow = window.innerHeight - coords.bottom;
    const top = spaceBelow > dropH ? coords.bottom + 4 : coords.top - dropH - 4;
    this.el.style.left = `${coords.left}px`;
    this.el.style.top = `${top}px`;
  }

  isVisible(): boolean {
    return this.state.tag === "visible";
  }

  moveBy(delta: number) {
    if (this.state.tag !== "visible") return;
    this.state = reducer(this.state, { type: "nav/move", delta });
    this.highlightSelected();
  }

  applySelected() {
    if (this.state.tag !== "visible") return;
    this.applyAt(this.state.selectedIndex);
  }

  private applyAt(index: number) {
    if (this.state.tag !== "visible") return;
    const suggestion = this.state.suggestions[index];
    if (!suggestion) return;

    const { state, dispatch } = this.view;
    const { $from } = state.selection;
    const tr = state.tr.insertText(suggestion, $from.start(), $from.end());
    dispatch(tr);
    this.dismiss();
  }

  dismiss() {
    this.state = reducer(this.state, { type: "action/dismiss" });
    this.el.style.display = "none";
  }

  destroy() {
    this.el.remove();
  }
}

export const buildAutocompletePlugin = () => {
  // Shared ref so handleKeyDown can reach the dropdown instance
  let dropdown: AutocompleteDropdown | null = null;

  return new Plugin({
    key: pluginKey,

    view(editorView) {
      dropdown = new AutocompleteDropdown(editorView);

      return {
        update(view: EditorView) {
          dropdown?.update(view.state);
        },
        destroy() {
          dropdown?.destroy();
          dropdown = null;
        },
      };
    },

    props: {
      handleKeyDown(_view, event) {
        if (!dropdown?.isVisible()) return false;

        if (event.key === "ArrowDown") {
          dropdown.moveBy(1);
          return true;
        }
        if (event.key === "ArrowUp") {
          dropdown.moveBy(-1);
          return true;
        }
        if (event.key === "Enter") {
          dropdown.applySelected();
          return true;
        }
        if (event.key === "Escape") {
          dropdown.dismiss();
          return true;
        }
        return false;
      },
    },
  });
};
