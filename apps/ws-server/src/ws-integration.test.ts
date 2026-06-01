import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import * as encoding from "lib0/encoding";
import { inArray } from "drizzle-orm";
import { db } from "@oh-writers/db";
import { sessions } from "@oh-writers/db/schema";

// Integration tests for the ws-server auth/access/persistence boundary.
// They boot a real ws-server child process and drive raw `ws` clients, so they
// exercise the actual upgrade handshake — covering Spec 09b "Test Coverage"
// bullets the E2E can't reach (close codes, server-side viewer write-drop, DB
// flush). Requires Postgres reachable via DATABASE_URL and the seeded fixtures.
//
// Skipped automatically when DATABASE_URL is unset (e.g. a pure unit CI lane).
const HAS_DB = !!process.env["DATABASE_URL"];
const d = HAS_DB ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 14321;
const URL = `ws://localhost:${PORT}`;

// Seeded fixtures (packages/db/src/seed): team screenplay 022 has test=owner,
// collab=editor, viewer=viewer. Screenplay 021 is valerio's personal project —
// collab has no access there (4003 case).
const TEST_USER = "00000000-0000-4000-a000-000000000001";
const VIEWER_USER = "00000000-0000-4000-a000-000000000002";
const TEAM_SCREENPLAY = "screenplay:00000000-0000-4000-a000-000000000022";
const NOACCESS_SCREENPLAY = "screenplay:00000000-0000-4000-a000-000000000021";
const UNKNOWN_SCREENPLAY = `screenplay:${randomUUID()}`;

let server: ChildProcess;
const createdTokens: string[] = [];

const mintSession = async (userId: string): Promise<string> => {
  const token = `ws-int-${randomUUID()}`;
  await db.insert(sessions).values({
    id: randomUUID(),
    userId,
    token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  createdTokens.push(token);
  return token;
};

const connect = (room: string, token: string): WebSocket =>
  new WebSocket(`${URL}/${room}?token=${token}`);

// Resolve with the close code when the server rejects, or 0 if the socket
// stays open past a short grace window (an accepted connection). A rejection
// opens the socket then immediately closes with the application code, so we
// must NOT resolve on "open" — we wait to see whether a close follows.
const settle = (ws: WebSocket): Promise<number> =>
  new Promise((res) => {
    let done = false;
    const finish = (code: number): void => {
      if (done) return;
      done = true;
      res(code);
    };
    ws.on("close", (code) => finish(code));
    ws.on("error", () => undefined); // the close event carries the code
    ws.on("open", () => setTimeout(() => finish(0), 800));
  });

beforeAll(async () => {
  server = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: resolve(here, ".."),
    env: { ...process.env, WS_PORT: String(PORT) },
    stdio: "ignore",
  });
  // Wait for the HTTP/WS server to accept connections.
  await new Promise((r) => setTimeout(r, 2500));
}, 20_000);

afterAll(async () => {
  server?.kill("SIGKILL");
  if (createdTokens.length > 0) {
    await db.delete(sessions).where(inArray(sessions.token, createdTokens));
  }
});

d("ws-server auth + access", () => {
  it("rejects a missing/invalid token with 4001", async () => {
    const ws = connect(TEAM_SCREENPLAY, "not-a-real-token");
    const code = await settle(ws);
    ws.close();
    expect(code).toBe(4001);
  });

  it("rejects a valid user without project access with 4003", async () => {
    const token = await mintSession(VIEWER_USER); // viewer has no access to 021
    const ws = connect(NOACCESS_SCREENPLAY, token);
    const code = await settle(ws);
    ws.close();
    expect(code).toBe(4003);
  });

  it("rejects an unknown room with 4004", async () => {
    const token = await mintSession(TEST_USER);
    const ws = connect(UNKNOWN_SCREENPLAY, token);
    const code = await settle(ws);
    ws.close();
    expect(code).toBe(4004);
  });

  it("accepts an editor with a valid token", async () => {
    const token = await mintSession(TEST_USER);
    const ws = connect(TEAM_SCREENPLAY, token);
    const code = await settle(ws);
    ws.close();
    expect(code).toBe(0); // opened, not closed
  });

  it("drops a viewer's write and returns WRITE_FORBIDDEN", async () => {
    const token = await mintSession(VIEWER_USER); // viewer on team screenplay 022
    const ws = connect(TEAM_SCREENPLAY, token);
    await settle(ws);

    const forbidden = new Promise<boolean>((res) => {
      ws.on("message", (data, isBinary) => {
        if (isBinary) return; // skip the binary y-protocol sync frames
        try {
          const msg = JSON.parse(data.toString()) as { code?: string };
          if (msg.code === "WRITE_FORBIDDEN") res(true);
        } catch {
          /* not our JSON error frame */
        }
      });
      setTimeout(() => res(false), 4000);
    });

    // Send a sync-update message (messageType 0, sync subtype 2) — a write.
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0); // messageSync
    encoding.writeVarUint(enc, 2); // sync update subtype
    encoding.writeVarUint8Array(enc, new Uint8Array([0])); // empty-ish payload
    ws.send(encoding.toUint8Array(enc));

    const got = await forbidden;
    ws.close();
    expect(got).toBe(true);
  });
});
