// Browser stub for the `postgres` driver.
// All DB access goes through createServerFn handlers — the driver is never
// reached client-side. Returning a no-op factory keeps Rollup happy when an
// API-route file or a type-only re-export pulls the package into the client
// graph.
const noop = () => {};
const stub = () => {
  throw new Error("postgres driver is not available in the browser bundle");
};
export default stub;
export { stub, noop };
