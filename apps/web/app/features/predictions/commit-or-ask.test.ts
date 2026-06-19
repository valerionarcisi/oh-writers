import { describe, it, expect } from "vitest";
import { DocumentTypes } from "@oh-writers/domain";
import type { Db } from "~/server/db";
import { commitOrAsk, isAsked } from "./auto-version.effect";

// commitOrAsk resolves the version action from pure inputs at the commit
// boundary. On a large, unconfirmed edit it must return an `asked` outcome and
// touch the DB for NOTHING — proven here with a Db that throws on any access.

const explodingDb = new Proxy(
  {},
  {
    get() {
      throw new Error("commitOrAsk must not touch the DB on an ask");
    },
  },
) as unknown as Db;

const LONG_BASE = Array.from({ length: 200 }, (_, i) => `parola${i}`).join(" ");
const FULL_REWRITE = Array.from({ length: 200 }, (_, i) => `nuova${i}`).join(
  " ",
);

describe("[OHW-N66] commitOrAsk — large unconfirmed edit asks, writes nothing", () => {
  it("returns an `asked` outcome carrying the entity and changed-word ratio", async () => {
    const result = await commitOrAsk(
      explodingDb,
      "doc-1",
      DocumentTypes.SOGGETTO,
      "user-1",
      LONG_BASE,
      FULL_REWRITE,
      "draft Cesare · soggetto",
      {
        sessionId: "session-1",
        userRequestedNewVersion: false,
        largeEditConfirmed: false,
      },
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const outcome = result.value;
      expect(isAsked(outcome)).toBe(true);
      if (isAsked(outcome)) {
        expect(outcome.documentType).toBe(DocumentTypes.SOGGETTO);
        // A full rewrite changes well over the 0.4 ratio threshold.
        expect(outcome.changedWordRatio).toBeGreaterThan(0.4);
      }
    }
  });

  it("a confirmed large edit does NOT ask (it would proceed to apply)", async () => {
    // largeEditConfirmed=true → resolver returns mint, not ask. We only assert it
    // is NOT an ask here; the apply path is covered by auto-version.effect.test.
    const result = await commitOrAsk(
      explodingDb,
      "doc-1",
      DocumentTypes.SOGGETTO,
      "user-1",
      LONG_BASE,
      FULL_REWRITE,
      "draft Cesare · soggetto",
      {
        sessionId: "session-1",
        userRequestedNewVersion: false,
        largeEditConfirmed: true,
      },
    ).mapErr(() => "delegated-to-apply" as const);
    // The exploding Db makes the apply path fail loudly; the point is it tried to
    // apply (touched the Db) rather than returning an ask.
    expect(result.isErr()).toBe(true);
  });
});
