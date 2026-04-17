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
  dispatchSceneNumberToast,
  hasConflict,
  resequenceFrom,
  resequenceFromHere,
  setSceneNumberLocked,
  unlockSceneNumber,
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
  private readonly menuBtn: HTMLButtonElement;
  private readonly slots: HTMLElement;
  private input: HTMLInputElement | null = null;
  private errorEl: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private readonly outsideMenuClick = (e: MouseEvent) => {
    if (!this.menu) return;
    const t = e.target as globalThis.Node | null;
    if (t && (this.menu.contains(t) || this.menuBtn.contains(t))) return;
    this.closeMenu();
  };
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
    this.menuBtn = this.createMenuButton();

    this.slots = document.createElement("div");
    this.slots.className = "pm-heading-slots";
    this.contentDOM = this.slots;

    this.dom.append(this.leftBtn, this.menuBtn, this.slots, this.rightBtn);
    this.syncAttrs();
  }

  private createMenuButton(): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scene-number-menu-btn";
    btn.textContent = "⋮";
    btn.setAttribute("data-testid", "scene-menu-trigger");
    btn.setAttribute("aria-label", "Scene actions");
    btn.setAttribute("aria-haspopup", "menu");
    btn.contentEditable = "false";
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMenu();
    });
    return btn;
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
    const tooltip = locked
      ? "Numero di scena bloccato: non verrà modificato da “Ricalcola numerazione”. Apri il menu ⋮ per sbloccarlo."
      : "Numero di scena. Clicca per modificarlo; verrà bloccato automaticamente.";
    this.leftBtn.title = tooltip;
    this.rightBtn.title = tooltip;
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

  private toggleMenu() {
    if (this.menu) {
      this.closeMenu();
      return;
    }
    this.openMenu();
  }

  private openMenu() {
    const locked = Boolean(this.node.attrs["scene_number_locked"]);
    const menu = document.createElement("div");
    menu.className = "scene-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("data-testid", "scene-menu");

    const items: Array<
      | {
          label: string;
          testid: string;
          onClick: () => void;
          disabled?: boolean;
        }
      | "divider"
    > = [
      {
        label: "Edit number",
        testid: "scene-menu-edit",
        onClick: () => {
          this.closeMenu();
          this.startEdit();
        },
      },
      {
        label: "Unlock number",
        testid: "scene-menu-unlock",
        disabled: !locked,
        onClick: () => {
          this.closeMenu();
          const pos = this.getPos();
          if (pos === undefined) return;
          unlockSceneNumber(this.view, pos);
        },
      },
      "divider",
      {
        label: "Resequence from here",
        testid: "scene-menu-resequence-from",
        onClick: () => {
          this.closeMenu();
          const pos = this.getPos();
          if (pos === undefined) return;
          const r = resequenceFrom(this.view, pos);
          if (!r.ok) dispatchSceneNumberToast(r.reason);
        },
      },
    ];

    for (const item of items) {
      if (item === "divider") {
        const hr = document.createElement("hr");
        hr.className = "scene-menu-divider";
        menu.appendChild(hr);
        continue;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scene-menu-item";
      btn.textContent = item.label;
      btn.setAttribute("role", "menuitem");
      btn.setAttribute("data-testid", item.testid);
      if (item.disabled) btn.disabled = true;
      btn.addEventListener("click", item.onClick);
      menu.appendChild(btn);
    }

    this.dom.appendChild(menu);
    this.menu = menu;
    this.menuBtn.setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", this.outsideMenuClick);
  }

  private closeMenu() {
    if (!this.menu) return;
    this.menu.remove();
    this.menu = null;
    this.menuBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", this.outsideMenuClick);
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
    if (t === this.leftBtn || t === this.rightBtn || t === this.menuBtn)
      return true;
    if (this.menu && this.menu.contains(t)) return true;
    return false;
  }

  ignoreMutation(m: MutationRecord): boolean {
    // PM must only observe mutations inside contentDOM (slots).
    // Button/input/menu/error live outside and are fully owned by the NodeView.
    return !this.slots.contains(m.target as globalThis.Node);
  }

  destroy() {
    if (this.menu) this.closeMenu();
  }
}

export const createHeadingNodeView = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView => new HeadingNodeView(node, view, getPos);
