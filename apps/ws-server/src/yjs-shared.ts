import { createRequire } from "node:module";

// y-websocket's bin/utils is CommonJS and `require("yjs")`. If we also `import`
// yjs as ESM we get two module records of the same physical package, which
// trips yjs's "already imported" guard and breaks `instanceof`/constructor
// checks. To guarantee a SINGLE instance shared with y-websocket, we load yjs
// through the same CommonJS require the bundled utils uses.
const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Y = require("yjs") as typeof import("yjs");

export const { Doc, encodeStateAsUpdate, applyUpdate } = Y;
export type Doc = import("yjs").Doc;
export { Y };
