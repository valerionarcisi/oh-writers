// Browser stub for `node:stream/web`. The DOM `ReadableStream` /
// `WritableStream` globals exist in browsers — re-export them. Server-only
// code paths never run client-side.
const _ReadableStream =
  typeof globalThis !== "undefined" && "ReadableStream" in globalThis
    ? globalThis.ReadableStream
    : class { constructor() {} };
const _WritableStream =
  typeof globalThis !== "undefined" && "WritableStream" in globalThis
    ? globalThis.WritableStream
    : class { constructor() {} };
const _TransformStream =
  typeof globalThis !== "undefined" && "TransformStream" in globalThis
    ? globalThis.TransformStream
    : class { constructor() {} };

export {
  _ReadableStream as ReadableStream,
  _WritableStream as WritableStream,
  _TransformStream as TransformStream,
}
export default {
  ReadableStream: _ReadableStream,
  WritableStream: _WritableStream,
  TransformStream: _TransformStream,
}
