import { Plugin, PluginKey } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import { rankByFrequency, filterSuggestions } from "@oh-writers/domain";
import {
  reducer,
  initialState,
  type AutocompleteState,
} from "./autocomplete-reducer";

// Walk the doc and harvest every filled text from the given slot type
// (`prefix` or `title`) across all headings. These strings form the
// project's in-use vocabulary — ranked by frequency and suggested back
// to the writer in the next picker.
const collectSlotValues = (doc: EditorState["doc"], slot: string): string[] => {
  const values: string[] = [];
  doc.descendants((node) => {
    if (node.type.name !== slot) return true;
    const t = node.textContent.trim();
    if (t.length > 0) values.push(t);
    return false;
  });
  return values;
};

const computeSlotSuggestions = (
  state: EditorState,
  slot: "prefix" | "title",
): string[] => {
  const { $from } = state.selection;
  if ($from.parent.type.name !== slot) return [];
  const typed = $from.parent.textContent;
  const vocabulary = rankByFrequency(collectSlotValues(state.doc, slot));
  return filterSuggestions(vocabulary, typed);
};

// Dropdown — structurally identical to the character/location picker, but
// scoped to a single heading slot and fed by rankByFrequency over the
// doc's own vocabulary.
class SlotDropdown {
  private el: HTMLUListElement;
  private state: AutocompleteState = initialState;

  constructor(
    private readonly view: EditorView,
    private readonly slot: "prefix" | "title",
  ) {
    this.el = document.createElement("ul");
    this.el.setAttribute("role", "listbox");
    this.el.dataset.pickerSlot = slot;
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
    const suggestions = computeSlotSuggestions(editorState, this.slot);
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
    // Replace the entire slot content — slot is an inline container,
    // $from.start()/.end() give its inner range.
    const tr = state.tr.insertText(suggestion, $from.start(), $from.end());

    // For the prefix slot: after filling it in, hop the cursor straight to
    // the title slot — the same navigation that Space performs in the keymap.
    // headingStart is stable across the insert (the insert is within the slot).
    if (this.slot === "prefix") {
      const headingDepth = $from.depth - 1;
      const heading = $from.node(headingDepth);
      if (heading.type.name === "heading") {
        const headingStart = $from.before(headingDepth) + 1;
        const newPrefixSize = 2 + suggestion.length;
        const titleContentStart = headingStart + newPrefixSize + 1;
        tr.setSelection(TextSelection.create(tr.doc, titleContentStart));
      }
    }

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

/**
 * Build a picker plugin bound to a single heading slot (`prefix` or
 * `title`). Options come from whatever the writer has already typed
 * elsewhere in the doc — nothing is hardcoded. First match wins on
 * handleKeyDown, so register these before the character/location
 * autocomplete plugin.
 */
export const buildSlotPickerPlugin = (slot: "prefix" | "title") => {
  const pluginKey = new PluginKey<null>(`scene-${slot}-picker`);
  let dropdown: SlotDropdown | null = null;

  return new Plugin({
    key: pluginKey,

    view(editorView) {
      dropdown = new SlotDropdown(editorView, slot);
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
