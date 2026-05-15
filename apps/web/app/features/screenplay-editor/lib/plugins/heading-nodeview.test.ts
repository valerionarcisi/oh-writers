// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";
import { createHeadingNodeView } from "./heading-nodeview";

const mockNode = {
  type: {},
  attrs: { scene_number: "1", scene_number_locked: false },
} as unknown as PMNode;

const mockView = {} as unknown as EditorView;
const getPos = () => 1 as unknown as undefined;

describe("createHeadingNodeView", () => {
  it("renders the menu trigger by default", () => {
    const nv = createHeadingNodeView(mockNode, mockView, getPos);
    const trigger = (nv.dom as HTMLElement).querySelector(
      '[data-testid="scene-menu-trigger"]',
    );
    expect(trigger).not.toBeNull();
  });

  it("renders the menu trigger when readOnly is false", () => {
    const nv = createHeadingNodeView(mockNode, mockView, getPos, {
      readOnly: false,
    });
    const trigger = (nv.dom as HTMLElement).querySelector(
      '[data-testid="scene-menu-trigger"]',
    );
    expect(trigger).not.toBeNull();
  });

  it("does not render the menu trigger when readOnly is true", () => {
    const nv = createHeadingNodeView(mockNode, mockView, getPos, {
      readOnly: true,
    });
    const trigger = (nv.dom as HTMLElement).querySelector(
      '[data-testid="scene-menu-trigger"]',
    );
    expect(trigger).toBeNull();
  });

  it("renders a single scene number badge (no duplicate)", () => {
    const nv = createHeadingNodeView(mockNode, mockView, getPos, {
      readOnly: true,
    });
    const badges = (nv.dom as HTMLElement).querySelectorAll(
      '[data-testid="scene-number-edit-trigger"]',
    );
    expect(badges.length).toBe(1);
  });
});
