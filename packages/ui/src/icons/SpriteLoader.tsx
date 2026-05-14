import { useEffect } from "react";

let injected = false;

export function SpriteLoader() {
  useEffect(() => {
    if (injected) return;
    if (document.querySelector("div[data-ds2-sprite]")) {
      injected = true;
      return;
    }
    injected = true;
    fetch("/icons/sprite.svg")
      .then((r) => r.text())
      .then((svg) => {
        const div = document.createElement("div");
        div.setAttribute("data-ds2-sprite", "");
        div.innerHTML = svg;
        div.style.position = "absolute";
        div.style.width = "0";
        div.style.height = "0";
        div.style.overflow = "hidden";
        div.setAttribute("aria-hidden", "true");
        document.body.insertBefore(div, document.body.firstChild);
      })
      .catch(() => {
        injected = false; // allow retry on next mount
      });
  }, []);
  return null;
}
