/**
 * Backfill Substack archive for a fundraising source.
 *
 * Usage:
 *   pnpm tsx scripts/fundraising-backfill.ts <source-id>
 *
 * Paginates Substack /api/v1/archive endpoint, fetches per-post HTML,
 * inserts into fundraising_items (dedup on guid). Idempotent — re-running
 * is safe and only adds new posts.
 */
import "@oh-writers/db/load-env";
import { db } from "@oh-writers/db";
import {
  fundraisingSources,
  fundraisingItems,
  type NewFundraisingItem,
} from "@oh-writers/db/schema";
import { eq } from "drizzle-orm";
import { htmlToText } from "../apps/web/app/features/fundraising/parsers";

const USER_AGENT = "OhWritersBot/1.0 (+https://oh-writers.app)";
const PAGE_SIZE = 50;

type ArchivePost = {
  id: number;
  slug: string;
  title: string | null;
  canonical_url: string;
  post_date: string;
  body_html?: string;
  description?: string;
};

const substackBase = (feedUrl: string): string => {
  const url = new URL(feedUrl);
  return `${url.protocol}//${url.host}`;
};

const fetchArchivePage = async (
  base: string,
  offset: number,
): Promise<ArchivePost[]> => {
  const url = `${base}/api/v1/archive?sort=new&search=&offset=${offset}&limit=${PAGE_SIZE}`;
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Archive fetch failed: HTTP ${res.status} @ ${url}`);
  }
  return (await res.json()) as ArchivePost[];
};

const fetchPostHtml = async (base: string, slug: string): Promise<string> => {
  const res = await fetch(`${base}/p/${slug}`, {
    headers: { "user-agent": USER_AGENT },
  });
  if (!res.ok) return "";
  return res.text();
};

const main = async (): Promise<void> => {
  const sourceId = process.argv[2];
  if (!sourceId) {
    console.error("Usage: tsx scripts/fundraising-backfill.ts <source-id>");
    process.exit(1);
  }

  const [source] = await db
    .select()
    .from(fundraisingSources)
    .where(eq(fundraisingSources.id, sourceId))
    .limit(1);

  if (!source) {
    console.error(`Source not found: ${sourceId}`);
    process.exit(1);
  }
  if (source.kind !== "substack") {
    console.error(`Backfill currently supports substack sources only.`);
    process.exit(1);
  }

  const base = substackBase(source.feedUrl);
  console.log(`Backfilling ${source.name} (${base}) ...`);

  let offset = 0;
  let totalFetched = 0;
  let totalInserted = 0;

  while (true) {
    let posts: ArchivePost[];
    try {
      posts = await fetchArchivePage(base, offset);
    } catch (e) {
      console.error(`Page fetch error at offset ${offset}: ${(e as Error).message}`);
      break;
    }
    if (posts.length === 0) break;

    const rows: NewFundraisingItem[] = [];
    for (const post of posts) {
      const html = post.body_html ?? (await fetchPostHtml(base, post.slug));
      rows.push({
        sourceId: source.id,
        guid: String(post.id),
        url: post.canonical_url,
        title: post.title ?? "(untitled)",
        publishedAt: post.post_date ? new Date(post.post_date) : null,
        rawHtml: html ?? "",
        rawText: htmlToText(html ?? post.description ?? ""),
      });
    }

    if (rows.length > 0) {
      const inserted = await db
        .insert(fundraisingItems)
        .values(rows)
        .onConflictDoNothing({
          target: [fundraisingItems.sourceId, fundraisingItems.guid],
        })
        .returning({ id: fundraisingItems.id });
      totalInserted += inserted.length;
    }

    totalFetched += posts.length;
    console.log(
      `  offset=${offset} page=${posts.length} insertedTotal=${totalInserted}`,
    );

    if (posts.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  await db
    .update(fundraisingSources)
    .set({ lastFetchedAt: new Date(), updatedAt: new Date() })
    .where(eq(fundraisingSources.id, source.id));

  console.log(
    `Done. Posts fetched: ${totalFetched}, inserted: ${totalInserted}`,
  );
  process.exit(0);
};

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
