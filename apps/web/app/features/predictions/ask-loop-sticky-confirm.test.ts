import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { documents, screenplays } from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import { executeDocumentGenTool } from "./cesare-document-tools";

// Spec 78 §A5 — the large-edit ask-loop fix.
//
// When Cesare makes a LARGE edit to an existing document it ASKS first
// ([Sovrascrivi] / [Nuova versione]). The card's choice is re-sent as a USER
// MESSAGE this turn ("…fanne una nuova versione…" / "Sovrascrivi…"), while the
// model re-runs the edit with its OWN paraphrased tool `instruction` that may
// drop the trigger word. Before this fix `commitOptions` read the choice only
// from the tool argument, so a second tool in the turn re-asked and overrode the
// answer (the loop). The fix threads the turn message into the gen tools so the
// confirmed decision is STICKY for the whole turn.
//
// These tests pin the boundary (`executeDocumentGenTool`): a large unconfirmed
// edit asks (writes nothing); the SAME edit with the confirm turn message
// APPLIES once — even though the tool's own `instruction` does NOT contain the
// trigger word.

// A long, distinct existing treatment so the mock output (a different, ~150-word
// block) is a "large" edit (the whole document changes → ratio ~1.0 ≫ 0.4).
const LONG_EXISTING_TREATMENT = Array.from(
  { length: 220 },
  (_, i) => `frase${i}`,
).join(" ");

interface MockState {
  contentByType: Partial<Record<string, string>>;
  screenplay: string;
}

// Minimal Db that satisfies the gen-tool read + apply path. Counts the version
// rows inserted so we can assert "exactly one apply" vs "no write on an ask".
const makeMockDb = (state: MockState) => {
  let insertedVersions = 0;

  const docRow = (type: string) => ({
    id: `doc-${type}`,
    content: state.contentByType[type] ?? "",
    currentVersionId: null,
    createdBy: "owner-1",
  });

  let pendingDocType: string | null = null;
  const docTypes = ["logline", "soggetto", "synopsis", "outline", "treatment"];

  const select = (columns: Record<string, unknown>) => ({
    from: (table: unknown) => {
      const resolve = (): unknown[] => {
        if (table === screenplays) return [{ content: state.screenplay }];
        if (table === documents && pendingDocType) {
          return [docRow(pendingDocType)];
        }
        if ("max" in columns) return [{ max: 0 }];
        return [];
      };
      const whereResult = {
        then: (r: (rows: unknown[]) => void) => r(resolve()),
        limit: () => Promise.resolve(resolve()),
        orderBy: () => ({ limit: () => Promise.resolve(resolve()) }),
      };
      return {
        where: (filter: unknown) => {
          const text = String(
            (filter as { queryChunks?: unknown[] })?.queryChunks ?? filter,
          );
          pendingDocType =
            docTypes.find((t) => text.includes(t)) ?? pendingDocType;
          return whereResult;
        },
      };
    },
  });

  const insert = () => ({
    values: () => ({
      returning: () => {
        insertedVersions += 1;
        return Promise.resolve([{ id: `version-${insertedVersions}` }]);
      },
    }),
  });
  const update = () => ({
    set: () => ({ where: () => Promise.resolve() }),
  });

  const db = {
    select,
    insert,
    update,
    transaction: async (fn: (tx: Db) => Promise<unknown>) => fn(db),
  } as unknown as Db;

  return { db, versionCount: () => insertedVersions };
};

const treatmentBlock = (input: Record<string, unknown> = {}) => ({
  type: "tool_use" as const,
  id: "tu-1",
  name: "propose_treatment_from_narrative",
  // The model's own paraphrased instruction — deliberately WITHOUT any
  // "nuova versione" / "sovrascrivi" trigger word, to prove the confirmation
  // comes from the turn message, not the tool argument.
  input: { instruction: "rendi il tono più cupo", ...input },
});

const upstreamState = (): MockState => ({
  contentByType: {
    treatment: LONG_EXISTING_TREATMENT,
    outline: '{"acts":[{"title":"Atto unico"}]}',
    synopsis: "Una sinossi di prova abbastanza lunga da essere materiale.",
    soggetto: "Un soggetto di prova.",
    logline: "Una logline di prova.",
  },
  screenplay: "",
});

const parse = (content: string) =>
  JSON.parse(content) as Record<string, unknown>;

describe("[OHW-N66] Spec 78 §A5 — large-edit confirmation is sticky per turn", () => {
  beforeEach(() => {
    process.env["MOCK_AI"] = "true";
  });
  afterEach(() => {
    delete process.env["MOCK_AI"];
  });

  it("asks (writes nothing) on a large unconfirmed edit", async () => {
    const { db, versionCount } = makeMockDb(upstreamState());

    const result = await executeDocumentGenTool(
      treatmentBlock(),
      db,
      "project-1",
      "owner-1",
      "session-1",
      // No confirmation in the turn message.
      "rendi il trattamento più cupo",
    );

    expect(result.isOk()).toBe(true);
    const payload = parse(result._unsafeUnwrap().content);
    expect(payload["asked_new_version"]).toBe(true);
    expect(payload["applied_live"]).toBe(false);
    // The ask must touch the version history for NOTHING.
    expect(versionCount()).toBe(0);
  });

  it("APPLIES (no re-ask) when the turn message says 'nuova versione', even though the tool instruction omits it", async () => {
    const { db, versionCount } = makeMockDb(upstreamState());

    const result = await executeDocumentGenTool(
      treatmentBlock(),
      db,
      "project-1",
      "owner-1",
      "session-1",
      // The confirm-card re-send for [Nuova versione].
      "Sì, fanne una nuova versione e applica la modifica.",
    );

    expect(result.isOk()).toBe(true);
    const payload = parse(result._unsafeUnwrap().content);
    expect(payload["applied_live"]).toBe(true);
    expect(payload["asked_new_version"]).toBeUndefined();
    expect(payload["document_type"]).toBe("treatment");
    // Exactly one new version was minted — no loop, no duplicate.
    expect(versionCount()).toBe(1);
  });

  it("APPLIES in place (no re-ask) when the turn message says 'sovrascrivi', even though the tool instruction omits it", async () => {
    const { db } = makeMockDb(upstreamState());

    const result = await executeDocumentGenTool(
      treatmentBlock(),
      db,
      "project-1",
      "owner-1",
      "session-1",
      // The confirm-card re-send for [Sovrascrivi].
      "Sovrascrivi la versione corrente con questa modifica.",
    );

    expect(result.isOk()).toBe(true);
    const payload = parse(result._unsafeUnwrap().content);
    expect(payload["applied_live"]).toBe(true);
    expect(payload["asked_new_version"]).toBeUndefined();
    expect(payload["document_type"]).toBe("treatment");
  });
});
