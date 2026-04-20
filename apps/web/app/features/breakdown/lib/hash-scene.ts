import { createHash } from "node:crypto";

export const normalizeSceneText = (raw: string): string =>
  raw.toLowerCase().replace(/\s+/g, " ").trim();

export const hashSceneText = (raw: string): string =>
  createHash("sha256").update(normalizeSceneText(raw)).digest("hex");
