import { describe, it, expect, vi } from "vitest";
import { DbError } from "@oh-writers/utils";
import type { Db } from "~/server/db";
import {
  projectIdFromShotPlan,
  projectIdFromScenarioId,
  projectIdFromShot,
  projectIdFromScene,
  projectIdFromLocation,
  projectIdFromSceneBlocking,
  projectIdFromPlanSceneCameras,
} from "./resolve-project-id";

const PROJECT = "00000000-0000-4000-a000-000000000001";

// Each resolver issues a drizzle `select().from()[.innerJoin()].where()` chain
// terminated by `.then(first)`. `.where()` is the last builder call, so it must
// return a real thenable resolving to `rows` for the await to work.
const dbReturning = (rows: unknown[]): Db => {
  const chain: Record<string, unknown> = {};
  chain["select"] = vi.fn(() => chain);
  chain["from"] = vi.fn(() => chain);
  chain["innerJoin"] = vi.fn(() => chain);
  chain["where"] = vi.fn(() => Promise.resolve(rows));
  return chain as unknown as Db;
};

describe("resolve-project-id — happy path", () => {
  it("projectIdFromShotPlan returns the row projectId", async () => {
    const r = await projectIdFromShotPlan(
      dbReturning([{ projectId: PROJECT }]),
      "plan-1",
    );
    expect(r.isOk() && r.value).toBe(PROJECT);
  });

  it("projectIdFromScenarioId joins scenario → plan → projectId", async () => {
    const r = await projectIdFromScenarioId(
      dbReturning([{ projectId: PROJECT }]),
      "scenario-1",
    );
    expect(r.isOk() && r.value).toBe(PROJECT);
  });

  it("projectIdFromShot walks shot → scenario → plan", async () => {
    // First query returns the scenarioId, the chained scenario query the project.
    let call = 0;
    const db = {
      select: vi.fn(() => db),
      from: vi.fn(() => db),
      innerJoin: vi.fn(() => db),
      where: vi.fn(() =>
        Promise.resolve(
          call++ === 0
            ? [{ scenarioId: "scenario-1" }]
            : [{ projectId: PROJECT }],
        ),
      ),
    } as unknown as Db;
    const r = await projectIdFromShot(db, "shot-1");
    expect(r.isOk() && r.value).toBe(PROJECT);
  });

  it("projectIdFromScene joins scene → screenplay → projectId", async () => {
    const r = await projectIdFromScene(
      dbReturning([{ projectId: PROJECT }]),
      "scene-1",
    );
    expect(r.isOk() && r.value).toBe(PROJECT);
  });

  it("projectIdFromLocation reads the direct projectId", async () => {
    const r = await projectIdFromLocation(
      dbReturning([{ projectId: PROJECT }]),
      "loc-1",
    );
    expect(r.isOk() && r.value).toBe(PROJECT);
  });

  it("projectIdFromSceneBlocking walks blocking → scene → projectId", async () => {
    let call = 0;
    const db = {
      select: vi.fn(() => db),
      from: vi.fn(() => db),
      innerJoin: vi.fn(() => db),
      where: vi.fn(() =>
        Promise.resolve(
          call++ === 0 ? [{ sceneId: "scene-1" }] : [{ projectId: PROJECT }],
        ),
      ),
    } as unknown as Db;
    const r = await projectIdFromSceneBlocking(db, "sb-1");
    expect(r.isOk() && r.value).toBe(PROJECT);
  });

  it("projectIdFromPlanSceneCameras walks cameras → scene → projectId", async () => {
    let call = 0;
    const db = {
      select: vi.fn(() => db),
      from: vi.fn(() => db),
      innerJoin: vi.fn(() => db),
      where: vi.fn(() =>
        Promise.resolve(
          call++ === 0 ? [{ sceneId: "scene-1" }] : [{ projectId: PROJECT }],
        ),
      ),
    } as unknown as Db;
    const r = await projectIdFromPlanSceneCameras(db, "psc-1");
    expect(r.isOk() && r.value).toBe(PROJECT);
  });
});

describe("resolve-project-id — missing entity (guessed UUID)", () => {
  it("an unknown id resolves to a DbError, never a projectId", async () => {
    const r = await projectIdFromScene(dbReturning([]), "ghost-scene");
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error).toBeInstanceOf(DbError);
      // The "not found" detail is the wrapped cause; the op tag identifies it.
      expect(r.error.message).toContain("resolveProjectId/scene");
    }
  });

  it("a missing shot does not leak a downstream project", async () => {
    const r = await projectIdFromShot(dbReturning([]), "ghost-shot");
    expect(r.isErr()).toBe(true);
  });
});
