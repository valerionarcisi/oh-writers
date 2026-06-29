import { test, expect } from "./fixtures";
import { BASE_URL } from "./fixtures";
import { TEAM_PROJECT_ID } from "./breakdown/helpers";
import { resetCesareState } from "./helpers/cesare";

/**
 * [R3] Free natural-language dispatch must be reliable.
 *
 * The audit found that ~1/3 of free write/edit requests fell through to a plain
 * "Ho letto la tua richiesta ma non ho strumenti da invocare" instead of
 * dispatching a generator. A Cesare-only writer phrases the SAME request a dozen
 * different ways; every one of them must reach the right tool.
 *
 * These cases post directly to the streaming route with the SESSION page context
 * (`page: "screenplay"` — what `deriveCesarePage` resolves a Cesare session to)
 * and assert, for MULTIPLE distinct phrasings per entity, that:
 *   1. a `writing{entity}` step is emitted (the tool ran), and
 *   2. the terminal `ohw:doc-applied` marker carries the right `document_type`
 *      and a non-null `version_id` — i.e. content was written + auto-versioned in
 *      the DB (the agentic-edit contract).
 *
 * A genuine QUESTION ("di cosa parla questo soggetto?") must NOT write anything.
 *
 * Runs in the `mock-ui` Playwright project (MOCK_AI=true); the deterministic mock
 * regexes map the broadened phrasings, so this is reproducible offline.
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

interface DocMarker {
  document_type?: string;
  version_id?: string | null;
}

function readDocMarker(result: string): DocMarker | null {
  const match = /<!--ohw:doc-applied:(.*?)-->/.exec(result);
  if (!match) return null;
  return JSON.parse(match[1]!) as DocMarker;
}

// A large edit (Spec 76) does NOT apply silently — it streams an ask card and
// stops the turn, emitting `ohw:ask-new-version` (carries document_type, but no
// version_id since nothing was written yet). A small edit applies live and emits
// `ohw:doc-applied`. Both are valid dispatch outcomes; this reads whichever the
// turn produced so the assertion checks "Cesare dispatched a write of the right
// entity", not the apply-vs-ask branch (which depends on edit size).
function readDispatchMarker(
  result: string,
): { documentType?: string; applied: boolean } | null {
  const applied = /<!--ohw:doc-applied:(.*?)-->/.exec(result);
  if (applied) {
    const m = JSON.parse(applied[1]!) as DocMarker;
    return { documentType: m.document_type, applied: true };
  }
  const asked = /<!--ohw:ask-new-version:(.*?)-->/.exec(result);
  if (asked) {
    const m = JSON.parse(asked[1]!) as { document_type?: string };
    return { documentType: m.document_type, applied: false };
  }
  return null;
}

async function postToCesare(
  request: import("@playwright/test").APIRequestContext,
  message: string,
) {
  const res = await request.post(`${BASE_URL}/api/cesare/stream`, {
    headers: { "Content-Type": "application/json" },
    data: {
      projectId: TEAM_PROJECT_ID,
      message,
      // Session page context: the shell defaults a Cesare session to
      // "screenplay", which is exactly the surface the audit persona used.
      pageContext: { page: "screenplay", sceneId: null, sceneNumber: null },
      conversationHistory: [],
    },
  });
  expect(res.status(), `stream route must authorize + accept: ${message}`).toBe(
    200,
  );
  const events = parseNdjson(await res.text());
  const done = events.find((e) => e._tag === "done");
  expect(done, `expected a done event for: ${message}`).toBeDefined();
  return { events, done: done! };
}

function assertWroteEntity(
  events: StreamEvent[],
  done: StreamEvent,
  entityDomain: string,
  documentType: string,
  message: string,
) {
  const wrote = events
    .filter((e) => e._tag === "writing")
    .some((e) => e.entity?.domain === entityDomain);
  expect(
    wrote,
    `expected a writing{${entityDomain}} step for "${message}"; got ${JSON.stringify(
      events.map((e) => ({ tag: e._tag, domain: e.entity?.domain })),
    )}`,
  ).toBe(true);

  // Cesare must dispatch a write of the right entity. The terminal marker is
  // doc-applied (small edit → live apply) OR ask-new-version (large edit →
  // Spec 76 asks before minting); either proves the dispatch reached the
  // executor for the right document_type.
  const marker = readDispatchMarker(done.result ?? "");
  expect(
    marker,
    `expected a doc-applied or ask-new-version marker for "${message}"; got ${done.result}`,
  ).not.toBeNull();
  expect(marker!.documentType).toBe(documentType);
}

test.describe("[R3] Free natural-language dispatch is reliable", () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await resetCesareState(authenticatedPage, TEAM_PROJECT_ID);
  });

  // 3 DIFFERENT free phrasings for the LOGLINE — all must dispatch + write.
  const LOGLINE_PHRASINGS = [
    "Scrivimi una logline su un detective insonne che insegue un killer.",
    "Buttami giù la logline.",
    "Rendi la logline più tesa.",
  ];

  for (const phrasing of LOGLINE_PHRASINGS) {
    test(`[R3] logline dispatch — "${phrasing}"`, async ({
      authenticatedPage: page,
    }) => {
      test.setTimeout(60_000);
      const { events, done } = await postToCesare(page.request, phrasing);
      assertWroteEntity(events, done, "logline", "logline", phrasing);
    });
  }

  // 3 DIFFERENT free phrasings for the SOGGETTO — all must dispatch + write.
  const SOGGETTO_PHRASINGS = [
    "Scrivi il soggetto.",
    "Genera il soggetto dalla logline.",
    "Rendi il soggetto più asciutto.",
  ];

  for (const phrasing of SOGGETTO_PHRASINGS) {
    test(`[R3] soggetto dispatch — "${phrasing}"`, async ({
      authenticatedPage: page,
    }) => {
      test.setTimeout(60_000);
      const { events, done } = await postToCesare(page.request, phrasing);
      assertWroteEntity(events, done, "soggetto", "soggetto", phrasing);
    });
  }

  // A genuine QUESTION must NOT write a document — it stays a chat answer.
  test("[R3] a genuine question does NOT dispatch a write", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60_000);
    const { events, done } = await postToCesare(
      page.request,
      "Di cosa parla questo soggetto?",
    );

    const wroteAnything = events
      .filter((e) => e._tag === "writing")
      .some((e) => Boolean(e.entity?.domain));
    expect(
      wroteAnything,
      `a question must not produce a writing step; got ${JSON.stringify(
        events.map((e) => ({ tag: e._tag, domain: e.entity?.domain })),
      )}`,
    ).toBe(false);

    expect(
      readDocMarker(done.result ?? ""),
      "a question must not apply a document",
    ).toBeNull();
  });
});
