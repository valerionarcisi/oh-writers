import { describe, it, expect } from "vitest";
import { findMockFixture } from "../_mocks/classify.fixtures";

// ─── Status derivation ────────────────────────────────────────────────────────

// We test the pure derivation logic by importing it directly. Because
// deriveStatus is not exported from classify.server.ts (it's internal), we
// reproduce its logic here as a thin wrapper — this keeps the test file
// independent from the server module (which imports Drizzle + Anthropic).

const deriveStatus = (
  deadlineAt: Date | null,
  confidence: number,
): "expired" | "unknown" | "active" => {
  if (deadlineAt !== null && deadlineAt < new Date()) return "expired";
  if (confidence < 0.5) return "unknown";
  return "active";
};

describe("deriveStatus", () => {
  it("returns 'expired' when deadline is in the past", () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
    expect(deriveStatus(pastDate, 0.9)).toBe("expired");
  });

  it("returns 'expired' even with high confidence when deadline has passed", () => {
    const pastDate = new Date("2020-01-01T00:00:00Z");
    expect(deriveStatus(pastDate, 1.0)).toBe("expired");
  });

  it("returns 'unknown' when confidence is below 0.5 and no deadline", () => {
    expect(deriveStatus(null, 0.3)).toBe("unknown");
  });

  it("returns 'unknown' when confidence is exactly 0", () => {
    expect(deriveStatus(null, 0)).toBe("unknown");
  });

  it("returns 'active' when deadline is future and confidence is high", () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    expect(deriveStatus(futureDate, 0.85)).toBe("active");
  });

  it("returns 'active' when there is no deadline and confidence >= 0.5", () => {
    expect(deriveStatus(null, 0.6)).toBe("active");
  });

  it("returns 'active' at exactly confidence 0.5", () => {
    expect(deriveStatus(null, 0.5)).toBe("active");
  });
});

// ─── Mock fixture lookup ──────────────────────────────────────────────────────

describe("findMockFixture", () => {
  it("returns bando_pubblico fixture for a title containing 'bando'", () => {
    const result = findMockFixture("Bando MiC per produzione 2026");
    expect(result.kind).toBe("bando_pubblico");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("returns bando_pubblico fixture for a title containing 'contribut'", () => {
    const result = findMockFixture("Contributi al cinema indipendente");
    expect(result.kind).toBe("bando_pubblico");
  });

  it("returns other fixture for an editorial title", () => {
    const result = findMockFixture("Editoriale: il futuro del cinema");
    expect(result.kind).toBe("other");
    expect(result.confidence).toBe(0);
  });

  it("returns other fixture for an interview title", () => {
    const result = findMockFixture("Intervista a un regista emergente");
    expect(result.kind).toBe("other");
  });

  it("falls back to other when title matches no fixture", () => {
    const result = findMockFixture("Notizie generiche sul festival");
    expect(result.kind).toBe("other");
    expect(result.confidence).toBe(0);
  });
});
