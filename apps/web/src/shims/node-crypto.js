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
// Spec 84 — crypto.server.ts (AES-256-GCM key encryption) reaches the client
// module graph the same way bible-distill does. These MUST throw, not no-op:
// a silent stub "encrypting" an API key client-side would be a security bug,
// not a hydration convenience.
const serverOnly = (name) => () => {
  throw new Error(`node:crypto.${name} is server-only and was called in client code`);
};
export const createCipheriv = serverOnly("createCipheriv");
export const createDecipheriv = serverOnly("createDecipheriv");
export default {
  createHash,
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
};
