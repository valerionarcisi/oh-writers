import { describe, it, expect } from "vitest";
import {
  generateSubjectSection,
  generateLoglineFromSubject,
} from "./subject-ai.server";

// Contract-level tests. Full behavior is covered by Playwright E2E (Task 10.x)
// because the server fns wire together requireUser, getDb, permissions and
// a rate-limit table — replicating all of that with mocks would be brittle
// and would mostly test the mocks.
describe("subject-ai server fns", () => {
  it("exports generateSubjectSection as a callable server fn", () => {
    expect(generateSubjectSection).toBeDefined();
    expect(typeof generateSubjectSection).toBe("function");
  });

  it("exports generateLoglineFromSubject as a callable server fn", () => {
    expect(generateLoglineFromSubject).toBeDefined();
    expect(typeof generateLoglineFromSubject).toBe("function");
  });
});
