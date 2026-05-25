import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchFeed } from "./rss.server";

const FEED_URL = "https://example.test/feed";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Sample</title>
    <link>https://example.test</link>
    <description>x</description>
    <item>
      <title>Bando regia 2026</title>
      <link>https://example.test/p/bando-regia</link>
      <guid>guid-1</guid>
      <pubDate>Wed, 01 Jan 2026 10:00:00 GMT</pubDate>
      <description>Scade il 30 settembre 2026, fino a €50.000.</description>
    </item>
    <item>
      <title>Editoriale</title>
      <link>https://example.test/p/editoriale</link>
      <guid>guid-2</guid>
      <pubDate>Wed, 02 Jan 2026 10:00:00 GMT</pubDate>
      <description>Riflessioni sul cinema.</description>
    </item>
  </channel>
</rss>`;

describe("fetchFeed", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fetchMock.mockReset();
  });

  it("parses RSS items and returns ETag/Last-Modified headers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(SAMPLE_RSS, {
        status: 200,
        headers: {
          etag: 'W/"abc123"',
          "last-modified": "Wed, 01 Jan 2026 10:00:00 GMT",
        },
      }),
    );

    const result = await fetchFeed({
      feedUrl: FEED_URL,
      etag: null,
      lastModified: null,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw result.error;
    expect(result.value.itemsXml.length).toBe(2);
    expect(result.value.itemsXml[0]?.title).toBe("Bando regia 2026");
    expect(result.value.etag).toBe('W/"abc123"');
    expect(result.value.lastModified).toBe("Wed, 01 Jan 2026 10:00:00 GMT");
  });

  it("forwards If-None-Match / If-Modified-Since when source has cache headers", async () => {
    fetchMock.mockResolvedValueOnce(new Response(SAMPLE_RSS, { status: 200 }));

    await fetchFeed({
      feedUrl: FEED_URL,
      etag: 'W/"abc123"',
      lastModified: "Wed, 01 Jan 2026 10:00:00 GMT",
    });

    const call = fetchMock.mock.calls[0];
    const headers = (call?.[1] as RequestInit | undefined)?.headers as
      | Record<string, string>
      | undefined;
    expect(headers?.["if-none-match"]).toBe('W/"abc123"');
    expect(headers?.["if-modified-since"]).toBe(
      "Wed, 01 Jan 2026 10:00:00 GMT",
    );
  });

  it("returns FundraisingNotModifiedError on 304", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));

    const result = await fetchFeed({
      feedUrl: FEED_URL,
      etag: 'W/"abc123"',
      lastModified: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected error");
    expect(result.error._tag).toBe("FundraisingNotModifiedError");
  });

  it("returns FundraisingFetchError on non-2xx non-304", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Internal", { status: 500 }));

    const result = await fetchFeed({
      feedUrl: FEED_URL,
      etag: null,
      lastModified: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected error");
    expect(result.error._tag).toBe("FundraisingFetchError");
  });

  it("returns FundraisingParseError on malformed XML", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<<not-xml>>", { status: 200 }),
    );

    const result = await fetchFeed({
      feedUrl: FEED_URL,
      etag: null,
      lastModified: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected error");
    expect(result.error._tag).toBe("FundraisingParseError");
  });

  it("returns FundraisingFetchError on network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ENOTFOUND"));

    const result = await fetchFeed({
      feedUrl: FEED_URL,
      etag: null,
      lastModified: null,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected error");
    expect(result.error._tag).toBe("FundraisingFetchError");
  });
});
