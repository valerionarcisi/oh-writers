import { useEffect, type RefObject } from "react";

/**
 * Recover text typed into a server-rendered input BEFORE React hydrated it.
 *
 * A controlled input on an SSR page is a promise the page cannot keep until
 * hydration finishes: the field is on screen and focusable — often `autoFocus`,
 * which actively invites typing — but its `onChange` is not wired yet. Anything
 * typed in that window lands in the DOM and never reaches React state. The two
 * then stay out of sync forever: the field shows the text, state holds "", and
 * anything gated on state (a submit button disabled while the value is empty)
 * stays dead in front of a user who can plainly see what they typed.
 *
 * This reads the DOM value once on mount and pushes it into state, so those
 * keystrokes are adopted instead of lost.
 *
 * @param ref     the input to adopt from
 * @param value   the controlled value, so an already-synced field is left alone
 * @param onValue called with the DOM value when it differs from `value`
 */
export function useHydratedInput(
  ref: RefObject<HTMLInputElement | null>,
  value: string,
  onValue: (next: string) => void,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const domValue = el.value;
    if (domValue !== value) onValue(domValue);
    // Mount only: this adopts what was typed before React took over. Re-running
    // it on every `value` change would fight the controlled input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
