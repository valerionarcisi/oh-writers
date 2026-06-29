import { test, expect, TEST_TEAM_PROJECT_ID, BASE_URL } from "../fixtures";
import type { Page } from "@playwright/test";

// Issue #61 — every mutating shooting-plan / blocking server fn must be gated at
// project "edit". A project VIEWER (member, read-only) must be refused with a
// ForbiddenError BEFORE any write runs, while the OWNER mutates freely and the
// VIEWER can still READ. We hit the server fns directly (the real access
// boundary) so the test holds even if the UI hides the buttons for a viewer.

// Deterministic team-project scene (packages/db/src/seed — TEST_BREAKDOWN_SCENE_2_ID).
const TEAM_SCENE_ID = "00000000-0000-4000-a000-000000010011";

const SHOOTING_PLAN_MODULE =
  "app_features_shooting-plan_server_shooting-plan_server_ts";

type Shape<T> =
  | { isOk: true; value: T }
  | { isOk: false; error: { _tag: string; message?: string } };

// POST a shooting-plan server fn through the given page's authenticated session.
const callFn = async <T>(
  page: Page,
  fn: string,
  data: unknown,
): Promise<Shape<T>> => {
  const url =
    `${BASE_URL}/_server/${SHOOTING_PLAN_MODULE}--${fn}_createServerFn_handler` +
    `?createServerFn`;
  // The dev server can answer 503 while it cold-compiles the module on first
  // hit; retry briefly so the first POST isn't a false failure.
  let res = await page.request.post(url, {
    headers: { "Content-Type": "application/json" },
    data: { data },
  });
  for (let i = 0; i < 5 && res.status() === 503; i++) {
    await page.waitForTimeout(1000);
    res = await page.request.post(url, {
      headers: { "Content-Type": "application/json" },
      data: { data },
    });
  }
  // The handler always returns a 200 with a ResultShape body (errors are values,
  // not HTTP failures). A non-200 here is itself a regression.
  expect(res.ok(), `${fn} returned HTTP ${res.status()}`).toBe(true);
  const body = (await res.json()) as { result: Shape<T> };
  return body.result;
};

interface PlanView {
  id: string;
  scenarios: { id: string }[];
}

test.describe("[#61] shooting-plan access control", () => {
  test("owner can create + mutate a shot plan; viewer is refused but can read", async ({
    authenticatedPage: owner,
    authenticatedViewerPage: viewer,
  }) => {
    // Warm the shooting-plan server module: the dev server JIT-compiles it on
    // first hit and returns 503 mid-compile. A real navigation forces the
    // compile before we POST the server fns directly.
    await owner.goto(
      `${BASE_URL}/projects/${TEST_TEAM_PROJECT_ID}/shooting-plan`,
    );
    await owner.waitForLoadState("networkidle");

    // ── Owner: create/get the plan (a gated write) ────────────────────────────
    const planRes = await callFn<PlanView>(owner, "getOrCreateInitialPlan", {
      sceneId: TEAM_SCENE_ID,
      projectId: TEST_TEAM_PROJECT_ID,
    });
    expect(planRes.isOk, "owner getOrCreateInitialPlan succeeds").toBe(true);
    if (!planRes.isOk) return;
    const shotPlanId = planRes.value.id;
    const scenarioId = planRes.value.scenarios[0]?.id;
    expect(scenarioId, "plan has a scenario").toBeTruthy();

    const addShotData = {
      scenarioId: scenarioId!,
      shotPlanId,
      projectId: TEST_TEAM_PROJECT_ID,
      shotSize: "WS" as const,
      cameraMovement: "STATIC" as const,
    };

    // ── Owner: addShot succeeds ───────────────────────────────────────────────
    const ownerAdd = await callFn<void>(owner, "addShot", addShotData);
    expect(ownerAdd.isOk, "owner addShot succeeds").toBe(true);

    // ── Viewer: the SAME write is refused with ForbiddenError ─────────────────
    const viewerAdd = await callFn<void>(viewer, "addShot", addShotData);
    expect(viewerAdd.isOk, "viewer addShot is refused").toBe(false);
    if (!viewerAdd.isOk) {
      expect(viewerAdd.error._tag).toBe("ForbiddenError");
    }

    // A viewer must not be able to seed/overwrite a plan either.
    const viewerCreate = await callFn<PlanView>(
      viewer,
      "getOrCreateInitialPlan",
      { sceneId: TEAM_SCENE_ID, projectId: TEST_TEAM_PROJECT_ID },
    );
    expect(viewerCreate.isOk, "viewer getOrCreateInitialPlan is refused").toBe(
      false,
    );
    if (!viewerCreate.isOk) {
      expect(viewerCreate.error._tag).toBe("ForbiddenError");
    }

    // ── Viewer: READ is still allowed (gate is "view" for reads) ──────────────
    const viewerRead = await callFn<PlanView | null>(viewer, "getShotPlan", {
      sceneId: TEAM_SCENE_ID,
      projectId: TEST_TEAM_PROJECT_ID,
    });
    expect(viewerRead.isOk, "viewer getShotPlan (read) is allowed").toBe(true);
  });
});
