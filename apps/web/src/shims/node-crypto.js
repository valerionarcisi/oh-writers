// Browser stub for node:crypto.
// bible-distill.server.ts imports createHash at module level. That file is
// server-only and never exercised in browser code, but Vite still evaluates
// the import during module graph construction. This no-op stub prevents the
// "Cannot access node:crypto.createHash in client code" crash so React
// hydration completes normally.
export const createHash = () => ({
  update: () => ({ digest: () => "" }),
});
export const randomBytes = () => new Uint8Array(0);
export const randomUUID = () => "00000000-0000-0000-0000-000000000000";
export default { createHash, randomBytes, randomUUID };
