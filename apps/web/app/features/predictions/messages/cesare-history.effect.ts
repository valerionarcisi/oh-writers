// apps/web/app/features/predictions/messages/cesare-history.effect.ts
// Spec 51 (steps 2 + 3) — the Effect data-loading that feeds the PURE markdown
// builders in `@oh-writers/domain`. Per the Spec 48 boundary rule: heavy DB
// assembly lives in an Effect under the foundation Layers; the markdown shaping
// itself is pure (in domain). The createServerFn boundary returns ResultShape.
//
// The history is a DERIVED VIEW: the changelog diff is RECOMPUTED here from the
// two `document_versions` rows (before → after), and the transcript is rebuilt
// from the persisted messages. Nothing reads pre-rendered markdown — delete any
// cache and the same input reproduces the same output.
import { Effect } from "effect";
import { inArray, eq } from "drizzle-orm";
import {
  cesareMessages,
  cesareSessions,
  documentVersions,
} from "@oh-writers/db/schema";
import type {
  EditChangelogSource,
  HistoryDiffSegment,
  SessionTranscriptSource,
  TranscriptMessage,
} from "@oh-writers/domain";
import { buildWordDiffSegments } from "@oh-writers/utils";
import { DbService } from "~/server/effect";
import { CesareError } from "../cesare.errors";
import { MessageMetadataSchema, type MessageMetadata } from "./messages.schema";

// ─── Entity labels (IT, capitalised) for the changelog heading ────────────────

const ENTITY_LABELS: Readonly<Record<string, string>> = {
  soggetto: "Soggetto",
  synopsis: "Sinossi",
  outline: "Scaletta",
  treatment: "Trattamento",
  logline: "Logline",
  screenplay: "Sceneggiatura",
};

const entityLabel = (documentType: string): string =>
  ENTITY_LABELS[documentType] ??
  (documentType.length > 0
    ? documentType.charAt(0).toUpperCase() + documentType.slice(1)
    : "Documento");

// ─── Internal row shapes ──────────────────────────────────────────────────────

interface VersionRow {
  readonly id: string;
  readonly number: number;
  readonly content: string;
}

const parseMetadata = (raw: unknown): MessageMetadata | null => {
  if (raw === null || raw === undefined) return null;
  const parsed = MessageMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

const emptyDiff: ReadonlyArray<HistoryDiffSegment> = [];

// ─── Edit changelog sources (step 2) ──────────────────────────────────────────
// Gather every edit marker recorded across a session's assistant messages, then
// derive the diff for each by recomputing `buildWordDiffSegments` from the two
// version rows. The markdown rendering is left to the pure domain builder.

const loadVersionsByIds = (
  ids: ReadonlyArray<string>,
): Effect.Effect<Map<string, VersionRow>, never, DbService> =>
  Effect.gen(function* () {
    if (ids.length === 0) return new Map<string, VersionRow>();
    const { db } = yield* DbService;
    const rows = yield* Effect.promise(() =>
      db
        .select({
          id: documentVersions.id,
          number: documentVersions.number,
          content: documentVersions.content,
        })
        .from(documentVersions)
        .where(inArray(documentVersions.id, [...ids])),
    );
    return new Map(rows.map((r) => [r.id, r]));
  });

interface EditMarkerWithTime {
  readonly documentType: string;
  readonly versionId: string;
  readonly previousVersionId: string | null;
  readonly createdAt: string | null;
}

const buildEditSource = (
  marker: EditMarkerWithTime,
  versions: Map<string, VersionRow>,
): EditChangelogSource => {
  const current = versions.get(marker.versionId) ?? null;
  const previous = marker.previousVersionId
    ? (versions.get(marker.previousVersionId) ?? null)
    : null;
  const diffSegments: ReadonlyArray<HistoryDiffSegment> = current
    ? buildWordDiffSegments(previous?.content ?? "", current.content)
    : emptyDiff;
  return {
    entity: marker.documentType,
    entityLabel: entityLabel(marker.documentType),
    versionId: marker.versionId,
    previousVersionId: marker.previousVersionId,
    versionNumber: current?.number ?? null,
    previousVersionNumber: previous?.number ?? null,
    diffSegments,
    createdAt: marker.createdAt,
  };
};

// All edit markers in a session, with the assistant message timestamp attached.
const loadSessionEditMarkers = (
  sessionId: string,
): Effect.Effect<EditMarkerWithTime[], never, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const rows = yield* Effect.promise(() =>
      db
        .select({
          metadata: cesareMessages.metadata,
          createdAt: cesareMessages.createdAt,
        })
        .from(cesareMessages)
        .where(eq(cesareMessages.sessionId, sessionId)),
    );
    const markers: EditMarkerWithTime[] = [];
    for (const row of rows) {
      const meta = parseMetadata(row.metadata);
      if (!meta) continue;
      for (const edit of meta.edits) {
        markers.push({
          documentType: edit.documentType,
          versionId: edit.versionId,
          previousVersionId: edit.previousVersionId,
          createdAt: row.createdAt.toISOString(),
        });
      }
    }
    return markers;
  });

/**
 * Effect: the per-edit changelog sources for a session (DERIVED). The pure
 * domain builder turns these into markdown; kept as data here so the same
 * sources feed BOTH the standalone changelog and the transcript without
 * re-querying.
 */
export const buildSessionEditSourcesEffect = (
  sessionId: string,
): Effect.Effect<EditChangelogSource[], CesareError, DbService> =>
  Effect.gen(function* () {
    const markers = yield* loadSessionEditMarkers(sessionId);
    const versionIds = Array.from(
      new Set(
        markers.flatMap((m) =>
          m.previousVersionId
            ? [m.versionId, m.previousVersionId]
            : [m.versionId],
        ),
      ),
    );
    const versions = yield* loadVersionsByIds(versionIds);
    return markers.map((m) => buildEditSource(m, versions));
  }).pipe(
    Effect.catchAllDefect((defect) =>
      Effect.fail(
        new CesareError(`buildSessionEditSources: ${String(defect)}`),
      ),
    ),
  );

// ─── Project history sources (step 4 — bounded context reuse) ─────────────────
// All edit markers across EVERY session of a project, most-recent last, capped.
// Feeds the bounded prompt-context summary so a follow-up session carries
// forward "what we changed" without re-querying per session.

const loadProjectEditMarkers = (
  projectId: string,
  limit: number,
): Effect.Effect<EditMarkerWithTime[], never, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const rows = yield* Effect.promise(() =>
      db
        .select({
          metadata: cesareMessages.metadata,
          createdAt: cesareMessages.createdAt,
        })
        .from(cesareMessages)
        .innerJoin(
          cesareSessions,
          eq(cesareMessages.sessionId, cesareSessions.id),
        )
        .where(eq(cesareSessions.projectId, projectId))
        .orderBy(cesareMessages.createdAt),
    );
    const markers: EditMarkerWithTime[] = [];
    for (const row of rows) {
      const meta = parseMetadata(row.metadata);
      if (!meta) continue;
      for (const edit of meta.edits) {
        markers.push({
          documentType: edit.documentType,
          versionId: edit.versionId,
          previousVersionId: edit.previousVersionId,
          createdAt: row.createdAt.toISOString(),
        });
      }
    }
    // Keep the most recent `limit` (markers are in ascending time order).
    return markers.slice(-limit);
  });

/**
 * Effect: the bounded set of recent edit sources for a whole project (DERIVED).
 * The pure domain `buildHistoryContextSummary` renders the capped markdown block
 * injected into the system prompt. `excludeVersionIds` drops edits already
 * implied by the live local context (avoids duplicating the current doc state).
 */
export const buildProjectHistorySourcesEffect = (
  projectId: string,
  limit: number,
): Effect.Effect<EditChangelogSource[], CesareError, DbService> =>
  Effect.gen(function* () {
    const markers = yield* loadProjectEditMarkers(projectId, limit);
    const versionIds = Array.from(
      new Set(
        markers.flatMap((m) =>
          m.previousVersionId
            ? [m.versionId, m.previousVersionId]
            : [m.versionId],
        ),
      ),
    );
    const versions = yield* loadVersionsByIds(versionIds);
    return markers.map((m) => buildEditSource(m, versions));
  }).pipe(
    Effect.catchAllDefect((defect) =>
      Effect.fail(
        new CesareError(`buildProjectHistorySources: ${String(defect)}`),
      ),
    ),
  );

// ─── Session transcript source (step 3) ───────────────────────────────────────

interface SessionMetaRow {
  readonly title: string;
  readonly createdAt: string;
}

const loadSessionMeta = (
  sessionId: string,
): Effect.Effect<SessionMetaRow | null, never, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const rows = yield* Effect.promise(() =>
      db
        .select({
          title: cesareSessions.title,
          createdAt: cesareSessions.createdAt,
        })
        .from(cesareSessions)
        .where(eq(cesareSessions.id, sessionId))
        .limit(1),
    );
    const row = rows[0];
    return row
      ? { title: row.title, createdAt: row.createdAt.toISOString() }
      : null;
  });

const loadTranscriptMessages = (
  sessionId: string,
): Effect.Effect<TranscriptMessage[], never, DbService> =>
  Effect.gen(function* () {
    const { db } = yield* DbService;
    const rows = yield* Effect.promise(() =>
      db
        .select({
          role: cesareMessages.role,
          content: cesareMessages.content,
          metadata: cesareMessages.metadata,
          createdAt: cesareMessages.createdAt,
        })
        .from(cesareMessages)
        .where(eq(cesareMessages.sessionId, sessionId))
        .orderBy(cesareMessages.createdAt),
    );
    return rows.map((row): TranscriptMessage => {
      const meta = parseMetadata(row.metadata);
      return {
        role: row.role,
        content: row.content,
        createdAt: row.createdAt.toISOString(),
        trace: (meta?.trace ?? []).map((step) => ({
          kind: step.kind,
          entityLabel: step.entity?.label ?? null,
          text: step.text,
        })),
        editVersionIds: (meta?.edits ?? []).map((e) => e.versionId),
      };
    });
  });

/**
 * Effect: the full transcript source for a session (DERIVED) — title +
 * conversation (with trace + edit links) + the per-edit changelog sources. The
 * pure domain builder renders the markdown.
 */
export const buildSessionTranscriptSourceEffect = (
  sessionId: string,
): Effect.Effect<SessionTranscriptSource, CesareError, DbService> =>
  Effect.gen(function* () {
    const meta = yield* loadSessionMeta(sessionId);
    if (!meta) {
      return {
        title: "Sessione",
        createdAt: null,
        messages: [],
        edits: [],
      } satisfies SessionTranscriptSource;
    }
    const messages = yield* loadTranscriptMessages(sessionId);
    const edits = yield* buildSessionEditSourcesEffect(sessionId);
    return {
      title: meta.title,
      createdAt: meta.createdAt,
      messages,
      edits,
    } satisfies SessionTranscriptSource;
  }).pipe(
    Effect.catchAllDefect((defect) =>
      Effect.fail(
        new CesareError(`buildSessionTranscriptSource: ${String(defect)}`),
      ),
    ),
  );
