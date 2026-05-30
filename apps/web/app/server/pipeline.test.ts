import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err, ResultAsync } from "neverthrow";
import { ForbiddenError, DbError } from "@oh-writers/utils";

// Mock the boundary dependencies before importing the unit under test.
vi.mock("~/server/db", () => ({
  getDb: vi.fn(),
}));
vi.mock("~/server/access", () => ({
  requireProjectAccess: vi.fn(),
  requireProjectAccessWithHeaders: vi.fn(),
}));

import { withProjectAccess, withProjectAccessHeaders } from "./pipeline";
import { getDb } from "~/server/db";
import {
  requireProjectAccess,
  requireProjectAccessWithHeaders,
} from "~/server/access";

const PROJECT_ID = "00000000-0000-4000-a000-000000000010";
const FAKE_DB = { __brand: "fake-db" } as never;
const FAKE_ACCESS = {
  user: { id: "u1", name: "U", email: "u@x", image: null, role: "user" },
  project: { id: PROJECT_ID },
  membership: null,
  role: null,
  isPersonalOwner: true,
} as never;

describe("withProjectAccess", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockResolvedValue(FAKE_DB);
    vi.mocked(requireProjectAccess).mockReset();
  });

  it("runs body with bootstrapped db + access when permission is granted", async () => {
    vi.mocked(requireProjectAccess).mockReturnValue(
      ResultAsync.fromSafePromise(Promise.resolve(FAKE_ACCESS)),
    );

    const body = vi.fn((ctx) =>
      ResultAsync.fromSafePromise(Promise.resolve(ctx.access.project.id)),
    );

    const result = await withProjectAccess(PROJECT_ID, "view", body);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe(PROJECT_ID);
    expect(body).toHaveBeenCalledTimes(1);
    const ctx = body.mock.calls[0]?.[0];
    expect(ctx?.db).toBe(FAKE_DB);
    expect(ctx?.access).toBe(FAKE_ACCESS);
  });

  it("short-circuits with ForbiddenError when access is denied", async () => {
    vi.mocked(requireProjectAccess).mockReturnValue(
      ResultAsync.fromPromise(
        Promise.reject(new ForbiddenError("edit project")),
        (e) => e as ForbiddenError,
      ),
    );
    const body = vi.fn();

    const result = await withProjectAccess(PROJECT_ID, "edit", body);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBeInstanceOf(ForbiddenError);
    expect(body).not.toHaveBeenCalled();
  });

  it("short-circuits with DbError when access resolution fails", async () => {
    vi.mocked(requireProjectAccess).mockReturnValue(
      ResultAsync.fromPromise(
        Promise.reject(new DbError("loadProject", "boom")),
        (e) => e as DbError,
      ),
    );
    const body = vi.fn();

    const result = await withProjectAccess(PROJECT_ID, "view", body);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBeInstanceOf(DbError);
    expect(body).not.toHaveBeenCalled();
  });

  it("withProjectAccessHeaders resolves access from the passed Headers (stream-route path)", async () => {
    vi.mocked(requireProjectAccessWithHeaders).mockReturnValue(
      ResultAsync.fromSafePromise(Promise.resolve(FAKE_ACCESS)),
    );
    const headers = new Headers({ cookie: "ohw.session=abc" });
    const body = vi.fn((ctx) =>
      ResultAsync.fromSafePromise(Promise.resolve(ctx.access.project.id)),
    );

    const result = await withProjectAccessHeaders(
      PROJECT_ID,
      "view",
      headers,
      body,
    );

    expect(result.isOk()).toBe(true);
    // The headers object is forwarded verbatim to the access resolver — this is
    // the fix for the stream-route 403 (session resolved from request headers,
    // not ambient getWebRequest()).
    expect(requireProjectAccessWithHeaders).toHaveBeenCalledWith(
      FAKE_DB,
      PROJECT_ID,
      "view",
      headers,
    );
    expect(body).toHaveBeenCalledTimes(1);
  });

  it("withProjectAccessHeaders short-circuits Forbidden when no session in headers", async () => {
    vi.mocked(requireProjectAccessWithHeaders).mockReturnValue(
      ResultAsync.fromPromise(
        Promise.reject(new ForbiddenError("read project")),
        (e) => e as ForbiddenError,
      ),
    );
    const body = vi.fn();

    const result = await withProjectAccessHeaders(
      PROJECT_ID,
      "view",
      new Headers(),
      body,
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBeInstanceOf(ForbiddenError);
    expect(body).not.toHaveBeenCalled();
  });

  it("propagates body's error union alongside access errors", async () => {
    class CustomError {
      readonly _tag = "CustomError" as const;
      constructor(readonly note: string) {}
    }
    vi.mocked(requireProjectAccess).mockReturnValue(
      ResultAsync.fromSafePromise(Promise.resolve(FAKE_ACCESS)),
    );
    const body = (_: unknown): ResultAsync<never, CustomError> =>
      ResultAsync.fromPromise(
        Promise.reject(new CustomError("nope")),
        (e) => e as CustomError,
      );

    const result = await withProjectAccess(PROJECT_ID, "view", body);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(CustomError);
    }
  });
});
