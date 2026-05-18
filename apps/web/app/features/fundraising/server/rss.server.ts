import Parser from "rss-parser";
import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { eq } from "drizzle-orm";
import {
  fundraisingSources,
  fundraisingItems,
  type FundraisingSource,
  type NewFundraisingItem,
} from "@oh-writers/db/schema";
import type { Db } from "~/server/db";
import { htmlToText } from "../parsers";
import {
  FundraisingFetchError,
  FundraisingParseError,
  FundraisingNotModifiedError,
  FundraisingThrottledError,
  DbError,
} from "../fundraising.errors";

const USER_AGENT = "OhWritersBot/1.0 (+https://oh-writers.app)";
const MIN_FETCH_INTERVAL_MS = 60_000;

type RawItem = {
  guid?: string;
  link?: string;
  id?: string;
  title?: string;
  isoDate?: string;
  pubDate?: string;
  content?: string;
  "content:encoded"?: string;
  contentSnippet?: string;
  summary?: string;
};

const parser = new Parser<Record<string, unknown>, RawItem>({
  customFields: {
    item: ["content:encoded", "summary"],
  },
});

export type FetchResult = {
  itemsXml: RawItem[];
  etag: string | null;
  lastModified: string | null;
};

export const fetchFeed = (
  source: Pick<FundraisingSource, "feedUrl" | "etag" | "lastModified">,
): ResultAsync<
  FetchResult,
  FundraisingFetchError | FundraisingParseError | FundraisingNotModifiedError
> => {
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9",
  };
  if (source.etag) headers["if-none-match"] = source.etag;
  if (source.lastModified) headers["if-modified-since"] = source.lastModified;

  return ResultAsync.fromPromise(
    fetch(source.feedUrl, { headers }),
    (e) => new FundraisingFetchError(source.feedUrl, e),
  ).andThen((res) => {
    if (res.status === 304) return errAsync(new FundraisingNotModifiedError(source.feedUrl));
    if (!res.ok)
      return errAsync(
        new FundraisingFetchError(
          source.feedUrl,
          new Error(`HTTP ${res.status}`),
        ),
      );
    const etag = res.headers.get("etag");
    const lastModified = res.headers.get("last-modified");
    return ResultAsync.fromPromise(
      res.text(),
      (e) => new FundraisingFetchError(source.feedUrl, e),
    ).andThen((xml) =>
      ResultAsync.fromPromise(
        parser.parseString(xml),
        (e) => new FundraisingParseError(source.feedUrl, e),
      ).map((parsed) => ({
        itemsXml: (parsed.items ?? []) as RawItem[],
        etag,
        lastModified,
      })),
    );
  });
};

const buildItemRow = (
  sourceId: string,
  raw: RawItem,
): NewFundraisingItem | null => {
  const guid = raw.guid ?? raw.id ?? raw.link;
  const url = raw.link ?? raw.guid ?? raw.id;
  if (!guid || !url) return null;
  const title = raw.title?.trim() ?? "(untitled)";
  const rawHtml = raw["content:encoded"] ?? raw.content ?? raw.summary ?? "";
  const rawText = htmlToText(rawHtml) || raw.contentSnippet || "";
  const publishedAt = raw.isoDate
    ? new Date(raw.isoDate)
    : raw.pubDate
      ? new Date(raw.pubDate)
      : null;
  return {
    sourceId,
    guid,
    url,
    title,
    publishedAt:
      publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    rawHtml: typeof rawHtml === "string" ? rawHtml : "",
    rawText,
  };
};

export const upsertItems = (
  db: Db,
  sourceId: string,
  rawItems: RawItem[],
): ResultAsync<{ inserted: number; skipped: number }, DbError> => {
  const rows = rawItems
    .map((raw) => buildItemRow(sourceId, raw))
    .filter((r): r is NewFundraisingItem => r !== null);

  if (rows.length === 0) return okAsync({ inserted: 0, skipped: 0 });

  return ResultAsync.fromPromise(
    db
      .insert(fundraisingItems)
      .values(rows)
      .onConflictDoNothing({
        target: [fundraisingItems.sourceId, fundraisingItems.guid],
      })
      .returning({ id: fundraisingItems.id }),
    (e) => new DbError("upsertFundraisingItems", e),
  ).map((inserted) => ({
    inserted: inserted.length,
    skipped: rows.length - inserted.length,
  }));
};

export type IngestSummary = {
  sourceId: string;
  inserted: number;
  skipped: number;
  notModified: boolean;
};

export const ingestSource = (
  db: Db,
  source: FundraisingSource,
  options: { skipThrottle?: boolean } = {},
): ResultAsync<
  IngestSummary,
  | FundraisingFetchError
  | FundraisingParseError
  | FundraisingThrottledError
  | DbError
> => {
  if (
    !options.skipThrottle &&
    source.lastFetchedAt &&
    Date.now() - source.lastFetchedAt.getTime() < MIN_FETCH_INTERVAL_MS
  ) {
    return errAsync(
      new FundraisingThrottledError(
        source.id,
        new Date(source.lastFetchedAt.getTime() + MIN_FETCH_INTERVAL_MS),
      ),
    );
  }

  return fetchFeed(source)
    .andThen((res) =>
      upsertItems(db, source.id, res.itemsXml).map((stats) => ({
        stats,
        etag: res.etag,
        lastModified: res.lastModified,
        notModified: false,
      })),
    )
    .orElse((e) => {
      if (e._tag === "FundraisingNotModifiedError") {
        return okAsync({
          stats: { inserted: 0, skipped: 0 },
          etag: source.etag,
          lastModified: source.lastModified,
          notModified: true,
        });
      }
      return errAsync(e);
    })
    .andThen((result) =>
      ResultAsync.fromPromise(
        db
          .update(fundraisingSources)
          .set({
            lastFetchedAt: new Date(),
            lastError: null,
            etag: result.etag,
            lastModified: result.lastModified,
            updatedAt: new Date(),
          })
          .where(eq(fundraisingSources.id, source.id)),
        (e) => new DbError("updateFundraisingSourceMeta", e),
      ).map(() => ({
        sourceId: source.id,
        inserted: result.stats.inserted,
        skipped: result.stats.skipped,
        notModified: result.notModified,
      })),
    )
    .orTee((e) => {
      // Best-effort error logging on the source row, don't fail the chain.
      void db
        .update(fundraisingSources)
        .set({
          lastFetchedAt: new Date(),
          lastError: e.message.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(fundraisingSources.id, source.id))
        .catch(() => undefined);
    });
};

export const listActiveSources = (
  db: Db,
): ResultAsync<FundraisingSource[], DbError> =>
  ResultAsync.fromPromise(
    db
      .select()
      .from(fundraisingSources)
      .where(eq(fundraisingSources.isActive, true)),
    (e) => new DbError("listActiveSources", e),
  );

export const ingestAllActive = async (
  db: Db,
): Promise<{
  total: number;
  ok: number;
  errors: { sourceId: string; error: string }[];
  inserted: number;
}> => {
  const sourcesResult = await listActiveSources(db);
  if (sourcesResult.isErr()) {
    return {
      total: 0,
      ok: 0,
      errors: [{ sourceId: "*", error: sourcesResult.error.message }],
      inserted: 0,
    };
  }
  const sources = sourcesResult.value;
  let inserted = 0;
  let okCount = 0;
  const errors: { sourceId: string; error: string }[] = [];

  for (const source of sources) {
    const r = await ingestSource(db, source, { skipThrottle: true });
    if (r.isOk()) {
      okCount += 1;
      inserted += r.value.inserted;
    } else {
      errors.push({ sourceId: source.id, error: r.error.message });
    }
  }

  return { total: sources.length, ok: okCount, errors, inserted };
};
