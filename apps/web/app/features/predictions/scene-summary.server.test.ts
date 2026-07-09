import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fingerprintBody,
  createKeyedTrailingDebounce,
} from "./scene-summary.server";

describe("[OHW-038e] scene-summary fingerprint", () => {
  it("produces a 16-char hex string", () => {
    const fp = fingerprintBody("INT. CUCINA - NOTTE\n\nDANTE\nGrida.");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same input", () => {
    const body = "INT. SALA - GIORNO\n\nFILIPPO\nEntra sorridendo.";
    expect(fingerprintBody(body)).toBe(fingerprintBody(body));
  });

  it("differs for different inputs", () => {
    const a = fingerprintBody("version A");
    const b = fingerprintBody("version B");
    expect(a).not.toBe(b);
  });

  it("differs for inputs with single character change (anti-stale guard)", () => {
    const base = "INT. BANCONE - GIORNO\nDANTE pulisce il bancone.";
    const modified = "INT. BANCONE - SERA\nDANTE pulisce il bancone.";
    expect(fingerprintBody(base)).not.toBe(fingerprintBody(modified));
  });

  it("handles empty string without throwing", () => {
    expect(() => fingerprintBody("")).not.toThrow();
    const fp = fingerprintBody("");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("[OHW-83] createKeyedTrailingDebounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a single schedule call for an idle key runs immediately (leading edge)", () => {
    vi.useFakeTimers();
    const debounce = createKeyedTrailingDebounce(60_000);
    const run = vi.fn();

    debounce.schedule("screenplay-1", run);
    // Leading edge: a lone save must never be lost to a restart inside the
    // window, so it runs right away (review finding, Spec 83 W1).
    expect(run).toHaveBeenCalledTimes(1);

    // ...and no trailing echo follows for a single call.
    vi.advanceTimersByTime(120_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a burst collapses to leading + one trailing run, timer reset by each call", () => {
    vi.useFakeTimers();
    const debounce = createKeyedTrailingDebounce(60_000);
    const run = vi.fn();

    debounce.schedule("screenplay-1", run);
    expect(run).toHaveBeenCalledTimes(1); // leading
    vi.advanceTimersByTime(2_000);
    debounce.schedule("screenplay-1", run);
    vi.advanceTimersByTime(2_000);
    debounce.schedule("screenplay-1", run);

    // 60s has not passed since the LAST schedule call — trailing not yet fired.
    vi.advanceTimersByTime(59_999);
    expect(run).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2); // trailing
  });

  it("different keys debounce independently", () => {
    vi.useFakeTimers();
    const debounce = createKeyedTrailingDebounce(60_000);
    const runA = vi.fn();
    const runB = vi.fn();

    // Both leading runs fire immediately and independently.
    debounce.schedule("screenplay-a", runA);
    expect(runA).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    debounce.schedule("screenplay-b", runB);
    expect(runB).toHaveBeenCalledTimes(1);

    // A second save on each key becomes an independent trailing run.
    debounce.schedule("screenplay-a", runA);
    debounce.schedule("screenplay-b", runB);
    vi.advanceTimersByTime(60_000);
    expect(runA).toHaveBeenCalledTimes(2);
    expect(runB).toHaveBeenCalledTimes(2);
  });

  it("clears the pending window once it elapses", () => {
    vi.useFakeTimers();
    const debounce = createKeyedTrailingDebounce(60_000);
    debounce.schedule("screenplay-1", () => {});
    expect(debounce.pendingCount()).toBe(1); // leading ran, window parked

    vi.advanceTimersByTime(60_000);
    expect(debounce.pendingCount()).toBe(0);

    // Next schedule after an elapsed window is leading again.
    const run = vi.fn();
    debounce.schedule("screenplay-1", run);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
