import type { FilmBible } from "../bible/schema.js";

export interface GlobalContext {
  readonly projectTitle: string;
  readonly genre: string | null;
  readonly format: string;
  readonly bible: FilmBible | null;
}
