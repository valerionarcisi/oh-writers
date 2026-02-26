// Browser stub for node:async_hooks.
// AsyncLocalStorage is a server-only API — TanStack Start's h3 adapter
// imports it at module level but it is never exercised in browser code.
// Vite externalises node: imports in browser mode, which causes a TypeError
// when the module initialises. This no-op class prevents that crash.
class AsyncLocalStorage {
  run(_, fn, ...args) { return fn(...args) }
  getStore() { return undefined }
  enterWith() {}
  exit(fn, ...args) { return fn(...args) }
  disable() {}
  static bind(fn) { return fn }
  static snapshot() { return (fn, ...args) => fn(...args) }
}

class AsyncResource {
  constructor() {}
  runInAsyncScope(fn, _, ...args) { return fn.call(_, ...args) }
  bind(fn) { return fn }
  static bind(fn) { return fn }
}

export { AsyncLocalStorage, AsyncResource }
export const createHook = () => ({ enable() {}, disable() {} })
export const executionAsyncId = () => 0
export const triggerAsyncId = () => 0
