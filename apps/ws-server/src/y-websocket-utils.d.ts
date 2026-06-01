// y-websocket ships bin/utils as untyped CommonJS. We consume a narrow slice
// of it (the persistence hook, the docs map, and setupWSConnection); the real
// shapes are asserted at the import boundary in persistence-binding.ts.
declare module "y-websocket/bin/utils" {
  const value: unknown;
  export = value;
}
