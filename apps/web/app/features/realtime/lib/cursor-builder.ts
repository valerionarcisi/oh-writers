/**
 * Builds the DOM for a remote collaborator's caret + name label, colored by the
 * peer's awareness `user.color`. Passed to y-prosemirror's `yCursorPlugin`.
 */
export const cursorBuilder = (user: {
  name?: string;
  color?: string;
}): HTMLElement => {
  const color = user.color ?? "#888";
  const caret = document.createElement("span");
  caret.classList.add("ProseMirror-yjs-cursor");
  caret.setAttribute("style", `border-color: ${color}`);

  const label = document.createElement("div");
  label.classList.add("ProseMirror-yjs-cursor-label");
  label.setAttribute("style", `background-color: ${color}`);
  label.textContent = user.name ?? "?";

  caret.appendChild(label);
  return caret;
};
