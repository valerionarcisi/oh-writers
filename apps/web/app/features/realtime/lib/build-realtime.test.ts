import { describe, expect, it } from "vitest";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { buildConnectedRealtime } from "./build-realtime";
import type { RealtimeStatus } from "../hooks/useYjsRoom";

const ydoc = {} as Y.Doc;
const provider = {} as WebsocketProvider;

describe("buildConnectedRealtime", () => {
  it("returns the doc + provider only when connected", () => {
    const result = buildConnectedRealtime({
      status: "connected",
      ydoc,
      provider,
    });
    expect(result).toEqual({ ydoc, provider });
  });

  it.each<RealtimeStatus>(["disabled", "connecting", "offline"])(
    "returns null when status is %s",
    (status) => {
      expect(buildConnectedRealtime({ status, ydoc, provider })).toBeNull();
    },
  );

  it("returns null when connected but the doc is missing", () => {
    expect(
      buildConnectedRealtime({ status: "connected", ydoc: null, provider }),
    ).toBeNull();
  });

  it("returns null when connected but the provider is missing", () => {
    expect(
      buildConnectedRealtime({ status: "connected", ydoc, provider: null }),
    ).toBeNull();
  });
});
