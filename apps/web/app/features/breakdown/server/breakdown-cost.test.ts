import { describe, it, expect } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sceneCostOccurrenceFilter } from "./breakdown-cost.server";

/**
 * #65 — the per-scene estimate used to sum occurrences across EVERY screenplay
 * version and to include the ones the user rejected, inflating the cost (on the
 * seeded project: 19 real elements counted as 119 across six versions).
 *
 * The filter is asserted as SQL rather than through a database, so the test
 * fails the moment a clause is dropped, without needing multi-version fixtures.
 */
const sqlOf = (q: ReturnType<typeof sceneCostOccurrenceFilter>): string =>
  new PgDialect().sqlToQuery(q!).sql;

describe("sceneCostOccurrenceFilter", () => {
  const sql = sqlOf(
    sceneCostOccurrenceFilter("project-1", "scene-1", "version-1"),
  );

  it("scopes to a single screenplay version", () => {
    expect(sql).toContain("screenplay_version_id");
  });

  it("excludes occurrences the user rejected", () => {
    expect(sql).toContain("cesare_status");
    expect(sql).toMatch(/<>|!=/);
  });

  it("still scopes to the project, the scene, and non-archived elements", () => {
    expect(sql).toContain("project_id");
    expect(sql).toContain("scene_id");
    expect(sql).toContain("archived_at");
  });
});
