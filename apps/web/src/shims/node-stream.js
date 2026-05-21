// Browser stub for `node:stream` — TanStack Start server-core imports
// `Readable` at module level for SSR rendering. Client bundle never runs
// the function, but the import must resolve so Rollup can complete bundling.
class Readable {
  constructor() {}
  read() { return null }
  pipe() { return this }
  on() { return this }
  off() { return this }
  static from() { return new Readable() }
}

class Writable {
  constructor() {}
  write() { return false }
  end() {}
  on() { return this }
  off() { return this }
}

class Transform extends Writable {}
class Duplex extends Writable {}
class PassThrough extends Transform {}

export { Readable, Writable, Transform, Duplex, PassThrough }
export default { Readable, Writable, Transform, Duplex, PassThrough }
