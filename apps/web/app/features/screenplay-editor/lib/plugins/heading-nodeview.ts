/**
 * Custom NodeView for the `heading` node — spec 05i block 2.
 *
 * Renders each scene heading as:
 *   <h2.pm-heading data-number data-locked>
 *     <button.scene-number.scene-number-left>   ← click → edit
 *     <div.pm-heading-slots>                    ← contentDOM (prefix + title)
 *     <button.scene-number.scene-number-right>
 *   </h2>
 *
 * Clicking either scene-number button swaps it for an <input>. On Enter / blur
 * we validate against `^\d+[A-Z]?$`, dispatch a PM transaction that updates
 * `scene_number` + sets `scene_number_locked=true`, and re-render. Escape
 * discards the edit.
 *
 * Conflict detection (number already used, ordering impossible) is block 3 —
 * this view only handles the "free, no conflict" happy path. For now every
 * valid edit simply overwrites the attr; block 3 will intercept the commit.
 */
import type { EditorView, NodeView } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import {
  dispatchConflict,
  hasConflict,
  resequenceFromHere,
  setSceneNumberLocked,
} from "./scene-number-commands";

const VALID_SCENE_NUMBER = /^(\d+)([A-Z]?)$/;

class HeadingNodeView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;

  private node: Node;
  private readonly view: EditorView;
  private readonly getPos: () => number | undefined;

  private readonly leftBtn: HTMLButtonElement;
  private readonly rightBtn: HTMLButtonElement;
  private readonly slots: HTMLElement;
  private input: HTMLInputElement | null = null;
  private errorEl: HTMLElement | null = null;
  // True while a conflict modal is awaiting user choice; blocks reentrant
  // commits (blur fires when the modal steals focus).
  private awaitingResolve = false;

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement("h2");
    this.dom.className = "pm-heading";

    this.leftBtn = this.createButton("scene-number-left");
    this.rightBtn = this.createButton("scene-number-right");

    this.slots = document.createElement("div");
    this.slots.className = "pm-heading-slots";
    this.contentDOM = this.slots;

    this.dom.append(this.leftBtn, this.slots, this.rightBtn);
    this.syncAttrs();
  }

  private createButton(side: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `scene-number scene-number-btn ${side}`;
    btn.setAttribute("data-testid", "scene-number-edit-trigger");
    btn.setAttribute("aria-label", "Edit scene number");
    btn.contentEditable = "false";
    // mousedown (not click) so PM doesn't steal focus before we react.
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.startEdit();
    });
    return btn;
  }

  private syncAttrs() {
    const n = (this.node.attrs["scene_number"] as string) ?? "";
    const locked = Boolean(this.node.attrs["scene_number_locked"]);
    this.dom.dataset["number"] = n;
    this.dom.dataset["locked"] = String(locked);
    this.leftBtn.textContent = n;
    this.rightBtn.textContent = n;
    const hide = n.length === 0;
    this.leftBtn.hidden = hide;
    this.rightBtn.hidden = hide;
    this.leftBtn.classList.toggle("is-locked", locked);
    this.rightBtn.classList.toggle("is-locked", locked);
  }

  private startEdit() {
    if (this.input) return;
    const current = (this.node.attrs["scene_number"] as string) ?? "";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "scene-number-input";
    input.value = current;
    input.setAttribute("data-testid", "scene-number-input");
    input.setAttribute("aria-label", "Scene number");
    input.autocapitalize = "characters";
    input.maxLength = 6;
    input.size = Math.max(3, current.length + 1);

    const err = document.createElement("span");
    err.className = "scene-number-error";
    err.setAttribute("data-testid", "scene-number-error");
    err.hidden = true;

    this.leftBtn.replaceWith(input);
    this.dom.insertBefore(err, this.slots);
    this.input = input;
    this.errorEl = err;

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.cancelEdit();
      }
    });
    input.addEventListener("blur", () => {
      // Delay so Escape's preventDefault path runs first.
      setTimeout(() => {
        if (this.input) this.commit();
      }, 0);
    });
    input.addEventListener("input", () => {
      input.value = input.value.toUpperCase();
      if (this.errorEl) this.errorEl.hidden = true;
    });

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  private cancelEdit() {
    if (!this.input) return;
    this.input.replaceWith(this.leftBtn);
    this.errorEl?.remove();
    this.input = null;
    this.errorEl = null;
    this.view.focus();
  }

  private showError(message: string) {
    if (!this.errorEl || !this.input) return;
    this.errorEl.textContent = message;
    this.errorEl.hidden = false;
    this.input.focus();
    this.input.select();
  }

  private commit() {
    if (!this.input || this.awaitingResolve) return;
    const raw = this.input.value.trim().toUpperCase();
    if (!VALID_SCENE_NUMBER.test(raw)) {
      this.showError("Use a number like 5 or 5A");
      return;
    }
    const pos = this.getPos();
    if (pos === undefined) {
      this.cancelEdit();
      return;
    }
    const current = (this.node.attrs["scene_number"] as string) ?? "";
    const wasLocked = Boolean(this.node.attrs["scene_number_locked"]);
    if (raw === current && wasLocked) {
      this.cancelEdit();
      return;
    }
    if (hasConflict(this.view.state.doc, pos, raw)) {
      // Hand decision to the React modal; keep input open until it resolves.
      this.awaitingResolve = true;
      dispatchConflict({
        current,
        proposed: raw,
        resolve: (choice) => {
          this.awaitingResolve = false;
          if (choice === "cancel") {
            this.cancelEdit();
            return;
          }
          if (choice === "lock") {
            setSceneNumberLocked(this.view, pos, raw);
            this.cancelEdit();
            return;
          }
          const r = resequenceFromHere(this.view, pos, raw);
          if (!r.ok) {
            this.showError(r.reason);
            return;
          }
          this.cancelEdit();
        },
      });
      return;
    }
    setSceneNumberLocked(this.view, pos, raw);
    this.cancelEdit();
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.syncAttrs();
    return true;
  }

  stopEvent(event: Event): boolean {
    const t = event.target as HTMLElement | null;
    if (!t) return false;
    if (t === this.input) return true;
    if (t === this.leftBtn || t === this.rightBtn) return true;
    return false;
  }

  ignoreMutation(m: MutationRecord): boolean {
    // PM must only observe mutations inside contentDOM (slots).
    // Button/input/error live outside and are fully owned by the NodeView.
    return !this.slots.contains(m.target as globalThis.Node);
  }
}

export const createHeadingNodeView = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView => new HeadingNodeView(node, view, getPos);
