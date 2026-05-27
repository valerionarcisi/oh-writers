import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { eq, sql } from "drizzle-orm";
import { screenplays, screenplayVersions } from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import { callHaiku, extractText } from "~/features/ai";
import { CesareError } from "./cesare.errors";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const CESARE_SCREENPLAY_TOOLS = [
  {
    name: "propose_screenplay_edit",
    description:
      "Propone una modifica puntuale al testo di una scena (find/replace verbatim). " +
      "L'utente vedrà la proposta come overlay sul testo con bottoni ✓/✕. " +
      "Usa quando la richiesta è una modifica circoscritta a una scena o a poche righe.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: { type: "integer", minimum: 1 },
        find: {
          type: "string",
          description:
            "Sottostringa esatta da cercare nel doc (verbatim, max 400 char)",
        },
        replace: {
          type: "string",
          description: "Testo proposto come sostituzione (max 800 char)",
        },
        reason: {
          type: "string",
          description:
            "Motivazione breve (max 200 char) mostrata all'utente nell'overlay",
        },
      },
      required: ["scene_number", "find", "replace", "reason"],
    },
  },
  {
    name: "propose_screenplay_revision",
    description:
      "Propone una riscrittura strutturale (macro) di un range di scene o " +
      "dell'intera sceneggiatura. Crea una DRAFT version visibile in diff " +
      "side-by-side che l'utente può accettare. Usa quando la richiesta è " +
      "'fammi una v2', 'più corta', 'tutto in una stanza', 'save the cat', ecc.",
    input_schema: {
      type: "object" as const,
      properties: {
        scope: {
          oneOf: [
            {
              type: "object",
              properties: { kind: { const: "whole_screenplay" } },
              required: ["kind"],
            },
            {
              type: "object",
              properties: {
                kind: { const: "scene_range" },
                from: { type: "integer" },
                to: { type: "integer" },
              },
              required: ["kind", "from", "to"],
            },
          ],
        },
        instruction: {
          type: "string",
          description:
            "Istruzione utente in linguaggio naturale (es. 'rendi più tesa', 'tutto in una stanza')",
        },
        label: {
          type: "string",
          description:
            "Etichetta breve per la versione draft (es. 'V2 — tutto in una stanza')",
        },
      },
      required: ["scope", "instruction", "label"],
    },
  },
  {
    name: "propose_rename_entity",
    description:
      "Propone una rinomina globale di un personaggio o location nella " +
      "sceneggiatura. L'utente vedrà la lista delle occorrenze e potrà " +
      "accettare in blocco. Usa per richieste tipo 'rinomina Mario in Lucia', " +
      "'inverti maschi/femmine' (componi N chiamate).",
    input_schema: {
      type: "object" as const,
      properties: {
        kind: { type: "string", enum: ["character", "location"] },
        from: { type: "string" },
        to: { type: "string" },
      },
      required: ["kind", "from", "to"],
    },
  },
  {
    name: "rewrite_scene",
    description:
      "Riscrive una singola scena inline nell'editor con un effetto typewriter. " +
      "L'utente vede il testo arrivare carattere per carattere come overlay verde " +
      "sulla scena originale. Al termine può accettare (la modifica entra nel doc) " +
      "o rifiutare (il testo originale rimane). " +
      "Usa quando l'utente chiede 'riscrivi questa scena', 'opzione B', " +
      "'rendi più intensa la scena N', 'dammi una versione alternativa di sc.N'. " +
      "NON usare per modifiche puntuali (< 3 righe) — usa propose_screenplay_edit. " +
      "NON usare per l'intera sceneggiatura — usa propose_screenplay_revision.",
    input_schema: {
      type: "object" as const,
      properties: {
        scene_number: {
          type: "integer",
          minimum: 1,
          description: "Numero della scena da riscrivere (1-based)",
        },
        new_content: {
          type: "string",
          description:
            "Il testo Fountain completo della scena riscritta. " +
            "Deve iniziare con uno slugline (INT./EXT. ...) e " +
            "includere tutto il corpo della scena.",
        },
      },
      required: ["scene_number", "new_content"],
    },
  },
] as const;

// ─── Proposed-edit payload ────────────────────────────────────────────────────

export type ProposedEditKind = "edit" | "rename_character" | "rename_location";

export interface ProposedEdit {
  readonly id: string;
  readonly screenplayId: string;
  readonly kind: ProposedEditKind;
  readonly sceneNumber: number | null;
  readonly find: string;
  readonly replace: string;
  readonly reason: string;
  readonly createdAt: number;
}

export interface DraftRevisionProposal {
  readonly id: string;
  readonly screenplayId: string;
  readonly versionId: string;
  readonly label: string;
  readonly instruction: string;
  readonly scenesChanged: number;
  readonly createdAt: number;
}

// ─── In-memory proposal store ─────────────────────────────────────────────────
//
// Proposals are ephemeral: they only need to live until the user accepts or
// rejects them. A per-screenplay map keeps the implementation simple and
// avoids a DB write surface for short-lived UI state. The trade-off — a
// proposal vanishes on server restart — is acceptable because the user will
// just re-ask Cesare. The alternative (a `screenplay_proposals` table) would
// add a migration + read path for no real recovery benefit.
//
// Keyed by screenplayId. Each entry has both pointwise proposals (edits,
// renames) and draft-revision banners (macro rewrites).

interface ProposalBucket {
  edits: ProposedEdit[];
  drafts: DraftRevisionProposal[];
}

// Bind the store to globalThis so every module instance Vite/Tanstack Start
// creates (api routes + .server.ts server functions go through different
// bundler transforms and can end up with separate module copies in dev) sees
// the same Map. Without this guard, a draft pushed via a server function is
// invisible to an api route that imports the same module name.
const STORE_KEY = Symbol.for("oh-writers.screenplay-proposal-store");
type GlobalWithStore = {
  [k: symbol]: Map<string, ProposalBucket> | undefined;
};
const g = globalThis as unknown as GlobalWithStore;
const PROPOSAL_STORE: Map<string, ProposalBucket> = (g[STORE_KEY] ??= new Map<
  string,
  ProposalBucket
>());

const getBucket = (screenplayId: string): ProposalBucket => {
  const existing = PROPOSAL_STORE.get(screenplayId);
  if (existing) return existing;
  const next: ProposalBucket = { edits: [], drafts: [] };
  PROPOSAL_STORE.set(screenplayId, next);
  return next;
};

export const listScreenplayProposals = (
  screenplayId: string,
): { edits: ProposedEdit[]; drafts: DraftRevisionProposal[] } => {
  const bucket = PROPOSAL_STORE.get(screenplayId);
  if (!bucket) return { edits: [], drafts: [] };
  return { edits: [...bucket.edits], drafts: [...bucket.drafts] };
};

export const removeScreenplayProposal = (
  screenplayId: string,
  proposalId: string,
): void => {
  const bucket = PROPOSAL_STORE.get(screenplayId);
  if (!bucket) return;
  bucket.edits = bucket.edits.filter((e) => e.id !== proposalId);
  bucket.drafts = bucket.drafts.filter((d) => d.id !== proposalId);
};

export const clearScreenplayProposals = (screenplayId: string): void => {
  PROPOSAL_STORE.delete(screenplayId);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const loadScreenplayForProject = (
  db: Db,
  projectId: string,
): ResultAsync<{ id: string; content: string }, CesareError> =>
  ResultAsync.fromPromise(
    db
      .select({ id: screenplays.id, content: screenplays.content })
      .from(screenplays)
      .where(eq(screenplays.projectId, projectId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    (e) =>
      new CesareError(
        `loadScreenplayForProject: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((row) =>
    row
      ? okAsync(row)
      : errAsync(new CesareError(`No screenplay for project ${projectId}`)),
  );

// Whole-word, case-insensitive matcher used by rename_entity. Splits the
// document on word boundaries and replaces every occurrence — the actual
// PM mapping happens client-side via the leaf-text walk, this only verifies
// that at least one match exists so we don't emit a no-op proposal.
export const countWholeWordOccurrences = (
  haystack: string,
  needle: string,
): number => {
  if (!needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "gi");
  let count = 0;
  while (re.exec(haystack) !== null) count += 1;
  return count;
};

// Pure helper exported for tests — clamps a scene_range scope into the
// available scene count.
export const clampSceneRange = (
  from: number,
  to: number,
  totalScenes: number,
): { from: number; to: number } => {
  const total = Math.max(1, totalScenes);
  const lo = Math.max(1, Math.min(total, Math.min(from, to)));
  const hi = Math.max(lo, Math.min(total, Math.max(from, to)));
  return { from: lo, to: hi };
};

// ─── Executors ────────────────────────────────────────────────────────────────

const PROPOSAL_TEXT_LIMIT = 800;
const PROPOSAL_FIND_LIMIT = 400;
const PROPOSAL_REASON_LIMIT = 200;

interface ProposeEditInput {
  scene_number: number;
  find: string;
  replace: string;
  reason: string;
}

const executeProposeScreenplayEdit = (
  input: ProposeEditInput,
  db: Db,
  projectId: string,
): ResultAsync<
  {
    proposed_edit: {
      id: string;
      scene_number: number;
      find: string;
      replace: string;
      reason: string;
    };
  },
  CesareError
> => {
  if (!input.find || input.find.length === 0) {
    return errAsync(new CesareError("propose_screenplay_edit: empty find"));
  }
  if (input.find.length > PROPOSAL_FIND_LIMIT) {
    return errAsync(
      new CesareError(
        `propose_screenplay_edit: 'find' exceeds ${PROPOSAL_FIND_LIMIT} chars`,
      ),
    );
  }
  if (input.replace.length > PROPOSAL_TEXT_LIMIT) {
    return errAsync(
      new CesareError(
        `propose_screenplay_edit: 'replace' exceeds ${PROPOSAL_TEXT_LIMIT} chars`,
      ),
    );
  }
  const reason = (input.reason ?? "").slice(0, PROPOSAL_REASON_LIMIT);

  return loadScreenplayForProject(db, projectId).andThen((sp) => {
    if (!sp.content.includes(input.find)) {
      return errAsync(
        new CesareError(
          "propose_screenplay_edit: 'find' string not present verbatim in the screenplay",
        ),
      );
    }
    const proposal: ProposedEdit = {
      id: crypto.randomUUID(),
      screenplayId: sp.id,
      kind: "edit",
      sceneNumber: input.scene_number,
      find: input.find,
      replace: input.replace,
      reason,
      createdAt: Date.now(),
    };
    getBucket(sp.id).edits.push(proposal);
    return okAsync({
      proposed_edit: {
        id: proposal.id,
        scene_number: proposal.sceneNumber ?? 0,
        find: proposal.find,
        replace: proposal.replace,
        reason: proposal.reason,
      },
    });
  });
};

interface RenameInput {
  kind: "character" | "location";
  from: string;
  to: string;
}

const executeProposeRenameEntity = (
  input: RenameInput,
  db: Db,
  projectId: string,
): ResultAsync<
  { proposed_edits: Array<{ id: string }>; total_occurrences: number },
  CesareError
> => {
  if (!input.from || !input.to) {
    return errAsync(
      new CesareError("propose_rename_entity: 'from' and 'to' required"),
    );
  }
  if (input.from === input.to) {
    return errAsync(
      new CesareError("propose_rename_entity: 'from' equals 'to'"),
    );
  }
  return loadScreenplayForProject(db, projectId).andThen((sp) => {
    const occurrences = countWholeWordOccurrences(sp.content, input.from);
    if (occurrences === 0) {
      return errAsync(
        new CesareError(
          `propose_rename_entity: '${input.from}' not found in screenplay`,
        ),
      );
    }
    // Emit a single proposal whose `find` is the entity name. The client
    // plugin performs the whole-word walk on the PM doc and decorates every
    // match — the user accepts/rejects in bulk per proposal.
    const reason = `Rinomina ${input.kind === "character" ? "personaggio" : "location"} '${input.from}' → '${input.to}' (${occurrences} occorrenze)`;
    const proposal: ProposedEdit = {
      id: crypto.randomUUID(),
      screenplayId: sp.id,
      kind: input.kind === "character" ? "rename_character" : "rename_location",
      sceneNumber: null,
      find: input.from,
      replace: input.to,
      reason,
      createdAt: Date.now(),
    };
    getBucket(sp.id).edits.push(proposal);
    return okAsync({
      proposed_edits: [{ id: proposal.id }],
      total_occurrences: occurrences,
    });
  });
};

interface ReviseInput {
  scope:
    | { kind: "whole_screenplay" }
    | { kind: "scene_range"; from: number; to: number };
  instruction: string;
  label: string;
}

const REVISION_MODEL = "claude-haiku-4-5";

const reviseSystemPrompt = `Sei uno sceneggiatore italiano esperto, specializzato nella riscrittura strutturale di sceneggiature in formato Fountain.
Output: SOLO il nuovo testo Fountain, senza meta-commenti, senza intestazioni esterne, senza markdown.
Mantieni la struttura Fountain (slugline INT./EXT., personaggi maiuscoli, parentetiche fra parentesi).`;

const reviseUserPrompt = (
  instruction: string,
  scopeLabel: string,
  fountain: string,
): string => `Istruzione: ${instruction}

Ambito: ${scopeLabel}

Testo Fountain da riscrivere:
---
${fountain}
---

Restituisci solo il nuovo testo Fountain riscritto, integrale.`;

// Slice a Fountain string by scene index (1-based, inclusive).
// A scene starts at a slugline (lines starting with INT./EXT./EST. or a
// period prefix `.SCENE`). The slice keeps the slugline at the start and
// stops just before the next scene's slugline.
export const sliceFountainSceneRange = (
  fountain: string,
  from: number,
  to: number,
): { before: string; slice: string; after: string } => {
  const lines = fountain.split("\n");
  const isSlugline = (raw: string): boolean => {
    const t = raw.trim();
    if (t.length === 0) return false;
    if (/^(INT\.|EXT\.|EST\.|INT\/EXT\.|I\/E\.)/i.test(t)) return true;
    if (/^\./.test(t) && !/^\.\./.test(t)) return true;
    return false;
  };
  const sceneStartLines: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (isSlugline(lines[i] ?? "")) sceneStartLines.push(i);
  }
  if (sceneStartLines.length === 0) {
    return { before: "", slice: fountain, after: "" };
  }
  const lo = Math.max(1, Math.min(from, to));
  const hi = Math.min(sceneStartLines.length, Math.max(from, to));
  const startLine = sceneStartLines[lo - 1] ?? 0;
  const endLine =
    hi < sceneStartLines.length
      ? (sceneStartLines[hi] ?? lines.length)
      : lines.length;
  return {
    before: lines.slice(0, startLine).join("\n"),
    slice: lines.slice(startLine, endLine).join("\n"),
    after: lines.slice(endLine).join("\n"),
  };
};

const nextDraftNumberFor = (
  db: Db,
  screenplayId: string,
): ResultAsync<number, CesareError> =>
  ResultAsync.fromPromise(
    db
      .select({
        max: sql<number>`coalesce(max(${screenplayVersions.number}), 0)`,
      })
      .from(screenplayVersions)
      .where(eq(screenplayVersions.screenplayId, screenplayId))
      .then((rows) => (rows[0]?.max ?? 0) + 1),
    (e) =>
      new CesareError(
        `nextDraftNumberFor: ${e instanceof Error ? e.message : String(e)}`,
      ),
  );

const findCreatorUserId = (
  db: Db,
  screenplayId: string,
): ResultAsync<string, CesareError> =>
  ResultAsync.fromPromise(
    db
      .select({ createdBy: screenplays.createdBy })
      .from(screenplays)
      .where(eq(screenplays.id, screenplayId))
      .limit(1)
      .then((rows) => rows[0]?.createdBy ?? null),
    (e) =>
      new CesareError(
        `findCreatorUserId: ${e instanceof Error ? e.message : String(e)}`,
      ),
  ).andThen((id) =>
    id
      ? okAsync(id)
      : errAsync(
          new CesareError("Screenplay has no creator user — corrupted row"),
        ),
  );

const executeProposeScreenplayRevision = (
  input: ReviseInput,
  db: Db,
  projectId: string,
): ResultAsync<
  {
    version_id: string;
    label: string;
    scenes_changed_count: number;
    proposal_id: string;
  },
  CesareError
> =>
  loadScreenplayForProject(db, projectId).andThen((sp) => {
    const label = (input.label ?? "").trim() || "Draft AI";
    const fountain = sp.content;

    const scopeLabel =
      input.scope.kind === "whole_screenplay"
        ? "intera sceneggiatura"
        : `scene ${input.scope.from}-${input.scope.to}`;

    let target = fountain;
    let beforeStr = "";
    let afterStr = "";
    if (input.scope.kind === "scene_range") {
      const sliced = sliceFountainSceneRange(
        fountain,
        input.scope.from,
        input.scope.to,
      );
      target = sliced.slice;
      beforeStr = sliced.before;
      afterStr = sliced.after;
    }

    // In MOCK_AI mode, skip the real Anthropic call and produce a
    // deterministic stub. The test isn't asserting on the rewritten content,
    // only that a draft version is created and the banner appears.
    const mockedRewrite: ResultAsync<string, CesareError> =
      process.env["MOCK_AI"] === "true"
        ? ResultAsync.fromSafePromise(
            Promise.resolve(
              `${target}\n\n[OHW-MOCK] Riscritto su istruzione: ${input.instruction}`,
            ),
          )
        : callHaiku(
            {
              system: reviseSystemPrompt,
              fewShot: [],
              user: reviseUserPrompt(input.instruction, scopeLabel, target),
              model: REVISION_MODEL,
              maxTokens: 4000,
            },
            "cesare.screenplay.revise",
          )
            .mapErr(
              (e) =>
                new CesareError(`Revision generation failed: ${e.message}`),
            )
            .andThen((reply) => {
              const newText = extractText(reply.content);
              if (!newText) {
                return errAsync(
                  new CesareError("Revision call returned no text"),
                );
              }
              return okAsync(newText);
            });

    return mockedRewrite.andThen((newText) => {
      const nextContent =
        input.scope.kind === "whole_screenplay"
          ? newText
          : `${beforeStr}${beforeStr ? "\n" : ""}${newText}${afterStr ? "\n" : ""}${afterStr}`;

      const scenesChangedApprox =
        input.scope.kind === "whole_screenplay"
          ? sp.content
              .split("\n")
              .filter((l) => /^(INT\.|EXT\.|EST\.|\.[A-Z])/i.test(l.trim()))
              .length
          : Math.max(1, input.scope.to - input.scope.from + 1);

      return nextDraftNumberFor(db, sp.id)
        .andThen((versionNumber) =>
          findCreatorUserId(db, sp.id).map((userId) => ({
            versionNumber,
            userId,
          })),
        )
        .andThen(({ versionNumber, userId }) =>
          ResultAsync.fromPromise(
            db
              .insert(screenplayVersions)
              .values({
                screenplayId: sp.id,
                number: versionNumber,
                label,
                content: nextContent,
                pageCount: 0,
                isDraft: true,
                draftDate: new Date().toISOString().slice(0, 10),
                createdBy: userId,
              })
              .returning({ id: screenplayVersions.id })
              .then((rows) => rows[0] ?? null),
            (e) =>
              new CesareError(
                `insert draft version: ${e instanceof Error ? e.message : String(e)}`,
              ),
          ),
        )
        .andThen((row) => {
          if (!row) {
            return errAsync(
              new CesareError("Draft version insert returned no rows"),
            );
          }
          const proposal: DraftRevisionProposal = {
            id: crypto.randomUUID(),
            screenplayId: sp.id,
            versionId: row.id,
            label,
            instruction: input.instruction,
            scenesChanged: scenesChangedApprox,
            createdAt: Date.now(),
          };
          getBucket(sp.id).drafts.push(proposal);
          return okAsync({
            version_id: row.id,
            label,
            scenes_changed_count: scenesChangedApprox,
            proposal_id: proposal.id,
          });
        });
    });
  });

// ─── rewrite_scene executor ───────────────────────────────────────────────────

interface RewriteSceneInput {
  scene_number: number;
  new_content: string;
}

const REWRITE_CONTENT_LIMIT = 8000;

const executeRewriteScene = (
  input: RewriteSceneInput,
): ResultAsync<
  { scene_number: number; accepted: false; marker: string },
  CesareError
> => {
  if (typeof input.scene_number !== "number" || input.scene_number < 1) {
    return errAsync(
      new CesareError("rewrite_scene: scene_number must be a positive integer"),
    );
  }
  if (!input.new_content || input.new_content.trim().length === 0) {
    return errAsync(new CesareError("rewrite_scene: new_content is empty"));
  }
  const content = input.new_content.slice(0, REWRITE_CONTENT_LIMIT);
  // The marker is embedded in the tool result text. The client side-channel
  // (`parseRewriteSceneMarker`) extracts it and dispatches the pending-edit
  // plugin with the scene number and new content.
  const payload = Buffer.from(
    JSON.stringify({ scene_number: input.scene_number, new_content: content }),
    "utf8",
  ).toString("base64");
  // Base64 encoding prevents Fountain syntax (e.g. `--> CUT TO:`) inside
  // new_content from containing `-->`, which would terminate the HTML comment
  // marker early and break `parseRewriteSceneMarker`.
  const marker = `<!--ohw:rewrite-scene-b64:${payload}-->`;
  return okAsync({ scene_number: input.scene_number, accepted: false, marker });
};

// ─── Public router ────────────────────────────────────────────────────────────

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

interface ToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

const toResult = (id: string, payload: unknown): ToolResult => ({
  type: "tool_result",
  tool_use_id: id,
  content: JSON.stringify(payload),
});

export const executeScreenplayTool = (
  block: ToolUseBlock,
  db: Db,
  projectId: string,
): ResultAsync<ToolResult, CesareError> => {
  if (block.name === "propose_screenplay_edit") {
    return executeProposeScreenplayEdit(
      block.input as ProposeEditInput,
      db,
      projectId,
    ).map((r) => toResult(block.id, r));
  }
  if (block.name === "propose_screenplay_revision") {
    return executeProposeScreenplayRevision(
      block.input as ReviseInput,
      db,
      projectId,
    ).map((r) => toResult(block.id, r));
  }
  if (block.name === "propose_rename_entity") {
    return executeProposeRenameEntity(
      block.input as RenameInput,
      db,
      projectId,
    ).map((r) => toResult(block.id, r));
  }
  if (block.name === "rewrite_scene") {
    return executeRewriteScene(block.input as RewriteSceneInput).map((r) =>
      toResult(block.id, r),
    );
  }
  return okAsync(
    toResult(block.id, { error: `Unknown screenplay tool: ${block.name}` }),
  );
};
