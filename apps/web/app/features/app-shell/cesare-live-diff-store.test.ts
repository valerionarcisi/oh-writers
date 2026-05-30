// apps/web/app/features/app-shell/cesare-live-diff-store.test.ts
//
// Spec 47e — the transient-flash live-diff store. The store models one-shot
// flash requests per document, each carrying a monotonic nonce; it never holds
// a persistent on/off mode. These tests pin the contract the consumer relies on
// to fire-and-forget without an update-depth loop.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  flashLiveDiff,
  getLiveDiffState,
  subscribeLiveDiff,
} from "./cesare-live-diff-store";

const seg = (op: "eq" | "add" | "del", text: string) => ({ op, text });

const soggetto = {
  documentType: "soggetto",
  label: "Soggetto",
  segments: [seg("eq", "Un film su "), seg("add", "Roma")],
};
const sinossi = {
  documentType: "sinossi",
  label: "Sinossi",
  segments: [seg("del", "vecchio"), seg("add", "nuovo")],
};

// Reset the module-level store between tests by flashing a fresh batch that
// overwrites the keys under test, and clearing subscribers via unsubscribe.
beforeEach(() => {
  // No public reset; each test keys its own documentType and reads back that
  // key, so cross-test bleed is avoided by assertion targeting.
});

describe("flashLiveDiff", () => {
  it("arms one flash per touched document keyed by documentType", () => {
    flashLiveDiff("mostra", [soggetto, sinossi]);
    const state = getLiveDiffState();
    expect(state.flashes["soggetto"]?.mode).toBe("mostra");
    expect(state.flashes["sinossi"]?.mode).toBe("mostra");
    expect(state.flashes["soggetto"]?.segments).toEqual(soggetto.segments);
  });

  it("shares one nonce across a batch but bumps it on the next request", () => {
    flashLiveDiff("mostra", [soggetto, sinossi]);
    const first = getLiveDiffState();
    const sharedNonce = first.flashes["soggetto"]?.nonce;
    expect(sharedNonce).toBe(first.flashes["sinossi"]?.nonce);

    flashLiveDiff("nascondi", [soggetto]);
    const second = getLiveDiffState();
    expect(second.flashes["soggetto"]?.nonce).toBeGreaterThan(sharedNonce ?? 0);
    expect(second.flashes["soggetto"]?.mode).toBe("nascondi");
  });

  it("re-clicking Mostra bumps the nonce so the consumer re-flashes", () => {
    flashLiveDiff("mostra", [soggetto]);
    const a = getLiveDiffState().flashes["soggetto"]?.nonce ?? 0;
    flashLiveDiff("mostra", [soggetto]);
    const b = getLiveDiffState().flashes["soggetto"]?.nonce ?? 0;
    expect(b).toBeGreaterThan(a);
  });

  it("is a no-op for an empty batch (no nonce bump, no notify)", () => {
    flashLiveDiff("mostra", [soggetto]);
    const before = getLiveDiffState().flashes["soggetto"]?.nonce ?? 0;
    const listener = vi.fn();
    const unsub = subscribeLiveDiff(listener);
    flashLiveDiff("mostra", []);
    expect(listener).not.toHaveBeenCalled();
    expect(getLiveDiffState().flashes["soggetto"]?.nonce).toBe(before);
    unsub();
  });

  it("ignores entries with an empty documentType", () => {
    const listener = vi.fn();
    const unsub = subscribeLiveDiff(listener);
    flashLiveDiff("mostra", [
      { documentType: "", label: "", segments: [seg("add", "x")] },
    ]);
    // The batch is non-empty so a notify still fires, but no "" key is stored.
    expect(getLiveDiffState().flashes[""]).toBeUndefined();
    unsub();
  });

  it("notifies subscribers on each flash", () => {
    const listener = vi.fn();
    const unsub = subscribeLiveDiff(listener);
    flashLiveDiff("mostra", [soggetto]);
    flashLiveDiff("nascondi", [soggetto]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
    flashLiveDiff("mostra", [soggetto]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
