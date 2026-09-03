import { createAPIFileRoute } from "@tanstack/start/api";
import { eq } from "drizzle-orm";
import {
  cesareSessions,
  documents,
  documentVersions,
} from "@oh-writers/db/schema";
import { DocumentTypes, type DocumentType } from "@oh-writers/domain";
import { getDb } from "~/server/db";

/**
 * Test-only endpoint that restores a project to a clean Cesare-agentic baseline
 * between Playwright tests.
 *
 * Spec 51 made the Cesare chat persistent: every turn writes rows to
 * `cesare_sessions` / `cesare_messages`, and every agentic edit mutates the
 * open document (+ a new `document_versions` row). The mock-ui Playwright
 * project runs serially against one shared test DB (`workers:1`,
 * `fullyParallel:false`), so without a reset a prior agentic test leaks its
 * document mutations and built-up session history into the next test — e.g. a
 * logline already rewritten to the mock output makes the next "the logline
 * changed" assertion fail because before === after.
 *
 * This endpoint, for the given project:
 *  - deletes every `cesare_sessions` row (cascade clears `cesare_messages`)
 *  - restores each narrative document (logline / soggetto / synopsis / outline
 *    / treatment) to its seed content, drops any extra versions, and rebuilds
 *    the seed "Versione 1" so reads resolve clean content again
 *
 * It reseeds only the affected tables (fast) rather than running the full
 * global reseed. Active only when `MOCK_AI=true`; returns 404 in production so
 * it never leaks. Always returns `{ ok: true }`.
 *
 * Body shape: `{ projectId: string }`.
 */

// Seed content for the shared test/team project (TEST_TEAM_PROJECT_ID,
// "00000000-0000-4000-a000-000000000011"). Mirrors packages/db/src/seed/index.ts
// so a reset restores the exact baseline the global setup seeds. Empty content
// means the seed creates no version for that type (seedFirstDocumentVersions
// skips empty docs), so the reset must not create one either.
const SOGGETTO_INITIAL_TEMPLATE =
  "Milano, fine anni Novanta. Marta, trentacinque anni, traduttrice freelance, vive sola in un bilocale che le sta troppo stretto. Ha smesso da tempo di credere di poter cambiare qualcosa: lavora, paga l'affitto, evita di pensare a suo padre — un uomo che non vede da quindici anni e di cui ha appena ricevuto la notizia della morte.\n\nTornata al paese per il funerale, Marta scopre che il padre le ha lasciato in eredità una vecchia libreria. Decide di venderla in fretta e ripartire. Ma il giorno prima della firma, tra gli scatoloni, trova un manoscritto inedito firmato da sua madre — morta quando lei aveva sette anni.\n\nLeggendolo, Marta capisce che la storia di sua madre era ben diversa da quella che le era stata raccontata. Decide di restare un altro giorno. Poi un altro. Riapre la libreria, cerca chi ha conosciuto sua madre, ricostruisce un'identità che non sapeva di aver perso. La firma del rogito le scivola di mano: la libreria non si vende più.\n\nCancella questo testo e scrivi il tuo soggetto. Puoi usare i titoli (H1) per dividere atti o capitoli, oppure scrivere tutto di seguito — il formato è libero.\n";

// Two-section synopsis baseline so `expand_section` (OHW-541) has a real
// "## Atto II" heading to find + expand — without it the tool is a (correct)
// no-op and emits no result card. MUST stay in lockstep with the global seed's
// TEST_TEAM_SYNOPSIS_SEED (packages/db/src/seed/index.ts); the db package does
// not export the seed module, so it is mirrored here by value, exactly as
// SOGGETTO_INITIAL_TEMPLATE is.
const SYNOPSIS_INITIAL_TEMPLATE =
  "## Atto I\n\nMarta torna al paese per il funerale del padre e scopre di aver ereditato una vecchia libreria. Vuole solo venderla e ripartire.\n\n## Atto II\n\nTra gli scatoloni trova un manoscritto inedito di sua madre. Quello che legge rimette in discussione tutto ciò che credeva di sapere sulla propria famiglia.\n";

const SEED_CONTENT_BY_TYPE: Readonly<Record<DocumentType, string>> = {
  logline: "A detective chases a killer through a silent city.",
  soggetto: SOGGETTO_INITIAL_TEMPLATE,
  synopsis: SYNOPSIS_INITIAL_TEMPLATE,
  outline: "",
  treatment: "",
};

const NARRATIVE_DOC_TYPES: ReadonlyArray<DocumentType> = [
  DocumentTypes.LOGLINE,
  DocumentTypes.SOGGETTO,
  DocumentTypes.SYNOPSIS,
  DocumentTypes.OUTLINE,
  DocumentTypes.TREATMENT,
];

export const APIRoute = createAPIFileRoute("/api/test/reset-cesare-state")({
  POST: async ({ request }) => {
    if (process.env["MOCK_AI"] !== "true") {
      return new Response("Not found", { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as {
      projectId?: string;
    } | null;
    if (!body || typeof body.projectId !== "string") {
      return new Response("Bad request", { status: 400 });
    }
    const projectId = body.projectId;

    const db = await getDb();

    // 1. Wipe Cesare chat threads (cascade clears cesare_messages).
    await db
      .delete(cesareSessions)
      .where(eq(cesareSessions.projectId, projectId));

    // 2. Restore narrative documents to their seed baseline.
    const projectDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId));

    let restored = 0;
    for (const doc of projectDocs) {
      const type = doc.type as DocumentType;
      if (!NARRATIVE_DOC_TYPES.includes(type)) continue;

      const seedContent = SEED_CONTENT_BY_TYPE[type];

      // Clear the active-version FK first, then drop every version row for this
      // document (drafts + any AI-created version) so we can rebuild the clean
      // seed version from scratch without leaving a dangling pointer.
      await db
        .update(documents)
        .set({ currentVersionId: null, yjsState: null })
        .where(eq(documents.id, doc.id));
      await db
        .delete(documentVersions)
        .where(eq(documentVersions.documentId, doc.id));

      // Recreate the seed "Versione 1" only for non-empty docs, mirroring
      // seedFirstDocumentVersions in the seed.
      if (seedContent.length > 0) {
        // `documents.createdBy` is nullable (set null when the author's
        // account is deleted); a seeded test document always has one, so a
        // missing value here means the seed itself is broken — fail loud
        // rather than writing a version with a fabricated author.
        if (!doc.createdBy) {
          throw new Error(
            `reset-cesare-state: document ${doc.id} has no createdBy — seed is broken`,
          );
        }
        const [version] = await db
          .insert(documentVersions)
          .values({
            documentId: doc.id,
            number: 1,
            label: "Versione 1",
            content: seedContent,
            createdBy: doc.createdBy,
          })
          .returning();
        await db
          .update(documents)
          .set({
            content: seedContent,
            currentVersionId: version ? version.id : null,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, doc.id));
      } else {
        await db
          .update(documents)
          .set({ content: seedContent, updatedAt: new Date() })
          .where(eq(documents.id, doc.id));
      }
      restored += 1;
    }

    return new Response(JSON.stringify({ ok: true, restored }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
