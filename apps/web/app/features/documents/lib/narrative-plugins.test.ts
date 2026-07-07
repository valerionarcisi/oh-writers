import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { getNarrativeSchema } from "./narrative-schema";
import { buildNarrativePlugins } from "./narrative-plugins";

const inputRulesPlugin = (enableHeadings: boolean) =>
  buildNarrativePlugins(getNarrativeSchema(enableHeadings)).find(
    (p) => (p.spec as { isInputRules?: boolean }).isInputRules,
  );

// Minimal `view` stub — `inputRules`'s handleTextInput only reads
// `view.composing` / `view.state` and calls `view.dispatch`.
const typeAtEnd = (
  state: EditorState,
  plugin: ReturnType<typeof inputRulesPlugin>,
  text: string,
): EditorState => {
  let current = state;
  const view = {
    composing: false,
    get state() {
      return current;
    },
    dispatch(tr: ReturnType<EditorState["tr"]["insertText"]>) {
      current = current.apply(tr);
    },
  };
  const pos = current.doc.content.size - 1;
  const handled = (
    plugin?.props as {
      handleTextInput?: (
        view: unknown,
        from: number,
        to: number,
        text: string,
      ) => boolean;
    }
  )?.handleTextInput?.(view, pos, pos, text);
  if (!handled) current = current.apply(current.tr.insertText(text, pos, pos));
  return current;
};

describe("buildNarrativePlugins — markdown input rules", () => {
  it("'## ' converts the current paragraph into an h2 heading", () => {
    const schema = getNarrativeSchema(true);
    const plugin = inputRulesPlugin(true);
    const state = EditorState.create({ schema });

    const next = typeAtEnd(state, plugin, "## ");

    const block = next.doc.firstChild;
    expect(block?.type.name).toBe("heading");
    expect(block?.attrs["level"]).toBe(2);
  });

  it("'### ' converts the current paragraph into an h3 heading", () => {
    const schema = getNarrativeSchema(true);
    const plugin = inputRulesPlugin(true);
    const state = EditorState.create({ schema });

    const next = typeAtEnd(state, plugin, "### ");

    const block = next.doc.firstChild;
    expect(block?.type.name).toBe("heading");
    expect(block?.attrs["level"]).toBe(3);
  });

  it("does nothing when headings are disabled (synopsis schema has no heading node)", () => {
    const schema = getNarrativeSchema(false);
    const plugin = inputRulesPlugin(false);
    const state = EditorState.create({ schema });

    const next = typeAtEnd(state, plugin, "## ");

    expect(next.doc.firstChild?.type.name).toBe("paragraph");
    expect(next.doc.textContent).toBe("## ");
  });
});
