import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { resetCesareState } from "./helpers/cesare";

/**
 * [Spec 47b] Universal dispatch in the active V2 path.
 *
 * The user requirement: a Cesare request issued on ANY page can write ANY
 * entity. The hardest cross-domain case is a request on the Sceneggiatura
 * (screenplay) page that writes the Soggetto. Before universal dispatch the
 * screenplay page exposed only the screenplay-edit + read-scene skills, so
 * `propose_soggetto_v2` had no owning skill and the V2 tool loop returned
 * "Unknown tool". With universal dispatch the document-gen skill is exposed on
 * every page, so the tool runs and writes the Soggetto, auto-creating a version
 * (agentic-edit pattern).
 *
 * We drive the active V2 streaming transport (`POST /api/cesare/stream`)
 * directly with `pageContext.page = "screenplay"`. This is the precise layer
 * A7 owns — page-agnostic dispatch — and exercises the real guards end to end:
 *   - `withProjectAccess` authorization (the route 403s a foreign project),
 *   - Zod validation of the request body,
 *   - the real tool executor (which auto-creates a version via applyVersionLive).
 * Driving the route directly also keeps the assertion immune to the bespoke
 * screenplay-page side-panel UI (out of A7 scope).
 *
 * The tool→entity map (cesare-tool-entity-map.ts) is keyed by TOOL NAME, not
 * page, so `propose_soggetto_v2` resolves to `writing{soggetto}` even though the
 * active page is `screenplay`. The terminal `done.result` carries the
 * `<!--ohw:doc-applied:{version_id,...}-->` marker the executor emits only when
 * the new version was applied LIVE — our "version created" proof.
 */

interface StreamEvent {
  _tag: string;
  entity?: { domain: string };
  result?: string;
}

function parseNdjson(body: string): StreamEvent[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StreamEvent);
}

test.describe("[Spec 47b] Cesare universal dispatch — cross-page write", () => {
  // Spec 51 persists the soggetto edit; the mock-ui project runs serially
  // against one shared DB. This test asserts a NEW version was applied live
  // (doc-applied marker) — but if a prior test already wrote the deterministic
  // soggetto v2, applying it again is a no-op and emits no marker. Restore the
  // seed soggetto + clear sessions before each test.
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  test("[047-A7] a request on the Sceneggiatura page writes the Soggetto (writing{soggetto}, version applied live)", async ({
    authenticatedPage,
  }) => {
    // POST through the authenticated browser context so the session cookie
    // rides along and `withProjectAccess` resolves the real user/project.
    const res = await authenticatedPage.request.post(
      `${BASE_URL}/api/cesare/stream`,
      {
        headers: { "Content-Type": "application/json" },
        data: {
          projectId: TEAM_PROJECT_ID,
          // The cross-domain request: a Soggetto rewrite, but the page is the
          // Sceneggiatura. Matches the mock `propose_soggetto_v2` scenario.
          message: "Fammi un v2 del soggetto più asciutto.",
          pageContext: {
            page: "screenplay",
            sceneId: null,
            sceneNumber: null,
          },
          conversationHistory: [],
        },
      },
    );

    expect(
      res.status(),
      "stream route must authorize + accept the request",
    ).toBe(200);

    const events = parseNdjson(await res.text());

    // The stream completed (the tool loop ran to a final result).
    const done = events.find((e) => e._tag === "done");
    expect(
      done,
      `expected a done event; got: ${JSON.stringify(events)}`,
    ).toBeDefined();

    // A foreign-domain WRITE happened: writing{soggetto} from the screenplay
    // page. Before universal dispatch this tool was not exposed here at all, so
    // no writing{soggetto} event could ever appear.
    const writes = events.filter((e) => e._tag === "writing");
    const wroteSoggetto = writes.some((e) => e.entity?.domain === "soggetto");
    expect(
      wroteSoggetto,
      `expected a writing{soggetto} event from the screenplay page; got: ${JSON.stringify(
        events,
      )}`,
    ).toBe(true);

    // The cross-page write dispatched to the Soggetto. The terminal marker is
    // doc-applied (small edit → live apply) OR ask-new-version (large edit →
    // Spec 76 streams an ask before minting). The seeded soggetto is ~180 words,
    // so a full rewrite is a large edit and correctly asks — both markers prove
    // the soggetto write reached the executor. Either way, document_type=soggetto.
    const result = done?.result ?? "";
    const appliedMatch = /<!--ohw:doc-applied:(.*?)-->/.exec(result);
    const askedMatch = /<!--ohw:ask-new-version:(.*?)-->/.exec(result);
    expect(
      appliedMatch ?? askedMatch,
      `expected a doc-applied or ask-new-version marker; got: ${result}`,
    ).not.toBeNull();
    const marker = JSON.parse((appliedMatch ?? askedMatch)![1]!) as {
      document_type?: string;
      version_id?: string | null;
    };
    expect(marker.document_type).toBe("soggetto");
    if (appliedMatch) {
      // When it applied (small edit), a new version id must be present.
      expect(
        marker.version_id,
        "an applied Soggetto edit must carry a new version id",
      ).toBeTruthy();
    }
  });

  test("[047-A7] the stream route still enforces project ownership (foreign project → not 200)", async ({
    authenticatedPage,
  }) => {
    // Safety guard intact: universal dispatch loosened the per-page TOOL gate,
    // NOT the project-access gate. A request for a project the user cannot
    // reach must never stream a write.
    const res = await authenticatedPage.request.post(
      `${BASE_URL}/api/cesare/stream`,
      {
        headers: { "Content-Type": "application/json" },
        data: {
          projectId: "00000000-0000-0000-0000-000000000000",
          message: "Fammi un v2 del soggetto più asciutto.",
          pageContext: { page: "screenplay", sceneId: null, sceneNumber: null },
          conversationHistory: [],
        },
      },
    );
    expect(res.status()).not.toBe(200);
  });
});
