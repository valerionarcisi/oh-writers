import { match } from "ts-pattern";

export type AutocompleteState =
  | { readonly tag: "hidden" }
  | {
      readonly tag: "visible";
      readonly suggestions: string[];
      readonly selectedIndex: number;
    };

export type AutocompleteEvent =
  | { readonly type: "suggestions/compute"; readonly suggestions: string[] }
  | { readonly type: "nav/move"; readonly delta: number }
  | { readonly type: "nav/set"; readonly index: number }
  | { readonly type: "action/dismiss" };

export const initialState: AutocompleteState = { tag: "hidden" };

export const reducer = (
  state: AutocompleteState,
  event: AutocompleteEvent,
): AutocompleteState =>
  match<[AutocompleteState, AutocompleteEvent], AutocompleteState>([
    state,
    event,
  ])
    .with([{ tag: "hidden" }, { type: "suggestions/compute" }], ([, e]) =>
      e.suggestions.length === 0
        ? { tag: "hidden" }
        : { tag: "visible", suggestions: e.suggestions, selectedIndex: 0 },
    )
    .with([{ tag: "visible" }, { type: "suggestions/compute" }], ([, e]) =>
      e.suggestions.length === 0
        ? { tag: "hidden" }
        : { tag: "visible", suggestions: e.suggestions, selectedIndex: 0 },
    )
    .with([{ tag: "visible" }, { type: "nav/move" }], ([s, e]) => ({
      tag: "visible",
      suggestions: s.suggestions,
      selectedIndex:
        (s.selectedIndex + e.delta + s.suggestions.length) %
        s.suggestions.length,
    }))
    .with([{ tag: "hidden" }, { type: "nav/move" }], ([s]) => s)
    .with([{ tag: "visible" }, { type: "nav/set" }], ([s, e]) => ({
      tag: "visible",
      suggestions: s.suggestions,
      selectedIndex: Math.max(0, Math.min(e.index, s.suggestions.length - 1)),
    }))
    .with([{ tag: "hidden" }, { type: "nav/set" }], ([s]) => s)
    .with([{ tag: "hidden" }, { type: "action/dismiss" }], ([s]) => s)
    .with([{ tag: "visible" }, { type: "action/dismiss" }], () => ({
      tag: "hidden",
    }))
    .exhaustive();
