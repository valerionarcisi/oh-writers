/**
 * Deterministic display color for a user, derived purely from their id.
 *
 * Pure and browser-safe — no `node:crypto`, no Node APIs — so it can run in the
 * editor (remote-cursor colors) and in any future mobile client. The hue is
 * spread across the full circle via an FNV-1a hash; saturation/lightness are
 * fixed so every color reads as a legible cursor/avatar tint.
 */

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

const fnv1a = (input: string): number => {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // Multiply by the FNV prime using 32-bit unsigned arithmetic.
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
};

export const userColor = (userId: string): string => {
  const hue = fnv1a(userId) % 360;
  return `hsl(${hue} 70% 60%)`;
};
