import { describe, it, expect } from "vitest";
import {
  ListSessionsInput,
  CreateSessionInput,
  RenameSessionInput,
  DeleteSessionInput,
  TouchSessionInput,
  DEFAULT_NEW_SESSION_TITLE,
  SESSION_TITLE_MAX,
} from "./sessions.schema";

const A_UUID = "0c4b40a5-1c8a-4b94-bc4e-9d20c2a1d3b4";
const ANOTHER_UUID = "11111111-1111-1111-1111-111111111111";

describe("CesareSessionsSchema — list", () => {
  it("accepts a UUID projectId", () => {
    const r = ListSessionsInput.safeParse({ projectId: A_UUID });
    expect(r.success).toBe(true);
  });

  it("rejects a non-UUID projectId", () => {
    const r = ListSessionsInput.safeParse({ projectId: "not-a-uuid" });
    expect(r.success).toBe(false);
  });
});

describe("CesareSessionsSchema — create", () => {
  it("accepts projectId only (title falls back to default downstream)", () => {
    const r = CreateSessionInput.safeParse({ projectId: A_UUID });
    expect(r.success).toBe(true);
  });

  it("accepts an explicit title", () => {
    const r = CreateSessionInput.safeParse({
      projectId: A_UUID,
      title: "Idee Atto II",
    });
    expect(r.success).toBe(true);
  });

  it("trims whitespace-only titles into a hard error", () => {
    const r = CreateSessionInput.safeParse({ projectId: A_UUID, title: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects titles longer than the SESSION_TITLE_MAX bound", () => {
    const tooLong = "a".repeat(SESSION_TITLE_MAX + 1);
    const r = CreateSessionInput.safeParse({
      projectId: A_UUID,
      title: tooLong,
    });
    expect(r.success).toBe(false);
  });
});

describe("CesareSessionsSchema — rename / delete / touch", () => {
  it("rename requires id + non-empty title", () => {
    const ok = RenameSessionInput.safeParse({
      id: A_UUID,
      title: "Nuovo titolo",
    });
    const bad = RenameSessionInput.safeParse({ id: A_UUID, title: "" });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it("delete requires a UUID id", () => {
    const ok = DeleteSessionInput.safeParse({ id: ANOTHER_UUID });
    const bad = DeleteSessionInput.safeParse({ id: "bad" });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it("touch requires a UUID id", () => {
    const ok = TouchSessionInput.safeParse({ id: ANOTHER_UUID });
    expect(ok.success).toBe(true);
  });
});

describe("CesareSessionsSchema — defaults", () => {
  it("exposes a single canonical default title", () => {
    expect(DEFAULT_NEW_SESSION_TITLE.length).toBeGreaterThan(0);
  });
});

describe("CesareSessionsSchema — boundaries", () => {
  it("accepts a title at exactly SESSION_TITLE_MAX characters", () => {
    const boundary = "a".repeat(SESSION_TITLE_MAX);
    const r = CreateSessionInput.safeParse({
      projectId: A_UUID,
      title: boundary,
    });
    expect(r.success).toBe(true);
  });

  it("trims surrounding whitespace on create", () => {
    const r = CreateSessionInput.safeParse({
      projectId: A_UUID,
      title: "   Idea  ",
    });
    if (r.success) {
      expect(r.data.title).toBe("Idea");
    } else {
      throw new Error("Expected the trimmed value to parse");
    }
  });

  it("trims surrounding whitespace on rename and rejects all-whitespace", () => {
    const ok = RenameSessionInput.safeParse({
      id: A_UUID,
      title: "  Riscrivi atto II  ",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.title).toBe("Riscrivi atto II");
    }
    const empty = RenameSessionInput.safeParse({ id: A_UUID, title: "    " });
    expect(empty.success).toBe(false);
  });

  it("rejects rename when title exceeds SESSION_TITLE_MAX", () => {
    const tooLong = "x".repeat(SESSION_TITLE_MAX + 1);
    const r = RenameSessionInput.safeParse({ id: A_UUID, title: tooLong });
    expect(r.success).toBe(false);
  });

  it("rejects rename when id is missing", () => {
    const r = RenameSessionInput.safeParse({ title: "x" });
    expect(r.success).toBe(false);
  });

  it("rejects list when projectId is missing entirely", () => {
    const r = ListSessionsInput.safeParse({});
    expect(r.success).toBe(false);
  });

  it("tolerates extra fields by stripping them (zod default behaviour)", () => {
    // Zod by default strips unknown keys; confirm the schema still accepts.
    const r = ListSessionsInput.safeParse({
      projectId: A_UUID,
      foo: "bar",
    });
    expect(r.success).toBe(true);
  });
});
