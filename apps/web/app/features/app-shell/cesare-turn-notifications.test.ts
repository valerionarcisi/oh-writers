// BUG-066 — pure settle-decision policy for the bell's one-row-per-turn model.
import { describe, it, expect } from "vitest";
import {
  decideTurnSettle,
  appliedTargetFromReply,
} from "./cesare-turn-notifications";

const docApplied = (documentType: string): string =>
  `<!--ohw:doc-applied:${JSON.stringify({
    document_type: documentType,
    version_id: "v-2",
    previous_version_id: "v-1",
  })}-->`;

const entityApplied = (domain: string): string =>
  `<!--ohw:entity-applied:${JSON.stringify({ domain, label: domain })}-->`;

describe("decideTurnSettle", () => {
  it("dismisses the pending row on user abort", () => {
    expect(decideTurnSettle("aborted", null)).toEqual({ kind: "dismiss" });
  });

  it("fails the pending row when the run errored", () => {
    expect(decideTurnSettle("failed", null)).toEqual({ kind: "fail" });
  });

  it("fails the pending row when delivered without a reply (defensive)", () => {
    expect(decideTurnSettle("delivered", null)).toEqual({ kind: "fail" });
  });

  it("dismisses a conversational turn (no tools ran)", () => {
    expect(decideTurnSettle("delivered", "Ecco la mia analisi.")).toEqual({
      kind: "dismiss",
    });
    expect(decideTurnSettle("delivered", "Analisi.<!--ohw:tools=0-->")).toEqual(
      { kind: "dismiss" },
    );
  });

  it("completes WITHOUT a link when tools ran but nothing was applied", () => {
    expect(
      decideTurnSettle("delivered", "Ho letto il soggetto.<!--ohw:tools=2-->"),
    ).toEqual({ kind: "complete-replied" });
  });

  it("completes WITH the applied document target (doc-applied marker)", () => {
    const decision = decideTurnSettle(
      "delivered",
      `Fatto.<!--ohw:tools=1-->${docApplied("soggetto")}`,
    );
    expect(decision.kind).toBe("complete-applied");
    if (decision.kind === "complete-applied") {
      expect(decision.target.domain).toBe("soggetto");
      expect(decision.target.page).toBe("soggetto");
      expect(decision.target.updatedLabelKey).toBe(
        "shell.notif.updated.soggetto",
      );
      expect(decision.target.goToLabelKey).toBe("shell.notif.goTo.soggetto");
    }
  });

  it("maps a logline edit to the soggetto page (logline has no page)", () => {
    const decision = decideTurnSettle(
      "delivered",
      `Fatto.<!--ohw:tools=1-->${docApplied("logline")}`,
    );
    expect(decision.kind).toBe("complete-applied");
    if (decision.kind === "complete-applied") {
      expect(decision.target.domain).toBe("logline");
      expect(decision.target.page).toBe("soggetto");
      expect(decision.target.goToLabelKey).toBe("shell.notif.goTo.logline");
    }
  });

  it("resolves entity-applied markers (e.g. budget) to their page", () => {
    const decision = decideTurnSettle(
      "delivered",
      `Fatto.<!--ohw:tools=1-->${entityApplied("budget")}`,
    );
    expect(decision.kind).toBe("complete-applied");
    if (decision.kind === "complete-applied") {
      expect(decision.target.page).toBe("budget");
      expect(decision.target.updatedLabelKey).toBe(
        "shell.notif.updated.budget",
      );
    }
  });

  it("falls back to complete-replied for an unknown applied domain (fail closed)", () => {
    const decision = decideTurnSettle(
      "delivered",
      `Fatto.<!--ohw:tools=1-->${entityApplied("not-a-domain")}`,
    );
    expect(decision).toEqual({ kind: "complete-replied" });
  });
});

describe("appliedTargetFromReply", () => {
  it("returns null when no apply marker is present", () => {
    expect(appliedTargetFromReply("Solo chiacchiere.")).toBeNull();
  });

  it("prefers the document marker over entity markers", () => {
    const target = appliedTargetFromReply(
      `${entityApplied("budget")}${docApplied("synopsis")}`,
    );
    expect(target?.domain).toBe("synopsis");
    expect(target?.page).toBe("synopsis");
  });
});
