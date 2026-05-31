import { describe, it, expect } from "vitest";
import {
  extractEditMarkers,
  buildAssistantMetadata,
  persistedToChatMessage,
} from "./message-metadata";
import type { ChatMessage } from "../use-cesare-chat-reducer";
import type { CesareMessage } from "./messages.schema";

// [OHW-051] — runtime ChatMessage ⇄ persisted wire shape bridge.

describe("extractEditMarkers", () => {
  it("parses every doc-applied marker in a cross-entity turn", () => {
    const content =
      "Fatto." +
      `<!--ohw:doc-applied:${JSON.stringify({
        document_type: "soggetto",
        version_id: "v-2",
        previous_version_id: "v-1",
      })}-->` +
      `<!--ohw:doc-applied:${JSON.stringify({
        document_type: "synopsis",
        version_id: "v-9",
        previous_version_id: null,
      })}-->`;
    const markers = extractEditMarkers(content);
    expect(markers).toEqual([
      { documentType: "soggetto", versionId: "v-2", previousVersionId: "v-1" },
      { documentType: "synopsis", versionId: "v-9", previousVersionId: null },
    ]);
  });

  it("returns an empty list when there are no markers", () => {
    expect(extractEditMarkers("Nessuna modifica.")).toEqual([]);
  });

  it("skips malformed markers without throwing", () => {
    const markers = extractEditMarkers("<!--ohw:doc-applied:{not json-->");
    expect(markers).toEqual([]);
  });
});

describe("buildAssistantMetadata", () => {
  it("captures the live trace + the edit markers from the reply", () => {
    const message: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: `Fatto.<!--ohw:doc-applied:${JSON.stringify({
        document_type: "soggetto",
        version_id: "v-2",
        previous_version_id: "v-1",
      })}-->`,
      status: "delivered",
      trace: [
        {
          kind: "reading",
          entity: { domain: "soggetto", label: "Soggetto" },
          text: "Soggetto",
        },
        { kind: "reasoning", entity: null, text: "Penso" },
      ],
    };
    const meta = buildAssistantMetadata(message);
    expect(meta.trace).toEqual([
      {
        kind: "reading",
        entity: { domain: "soggetto", label: "Soggetto" },
        text: "Soggetto",
      },
      { kind: "reasoning", entity: null, text: "Penso" },
    ]);
    expect(meta.edits).toEqual([
      { documentType: "soggetto", versionId: "v-2", previousVersionId: "v-1" },
    ]);
  });
});

describe("persistedToChatMessage", () => {
  it("rebuilds a delivered assistant message with its trace", () => {
    const row: CesareMessage = {
      id: "a1",
      sessionId: "s1",
      role: "assistant",
      content: "Fatto.",
      metadata: {
        trace: [
          {
            kind: "writing",
            entity: { domain: "soggetto", label: "Soggetto" },
            text: "Soggetto",
          },
        ],
        edits: [],
      },
      createdAt: "2026-05-31T10:00:00.000Z",
    };
    const msg = persistedToChatMessage(row);
    expect(msg).toMatchObject({
      id: "a1",
      role: "assistant",
      content: "Fatto.",
      status: "delivered",
    });
    expect(msg.trace).toHaveLength(1);
    expect(msg.trace[0]).toMatchObject({ kind: "writing", text: "Soggetto" });
  });

  it("rebuilds a user message with an empty trace", () => {
    const row: CesareMessage = {
      id: "u1",
      sessionId: "s1",
      role: "user",
      content: "Ciao",
      metadata: null,
      createdAt: "2026-05-31T09:59:00.000Z",
    };
    expect(persistedToChatMessage(row)).toEqual({
      id: "u1",
      role: "user",
      content: "Ciao",
      status: "delivered",
      trace: [],
    });
  });
});
