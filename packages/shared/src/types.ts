// Branded type utility — prevents mixing IDs of different entities
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type TeamId = Brand<string, "TeamId">;
export type ProjectId = Brand<string, "ProjectId">;
export type DocumentId = Brand<string, "DocumentId">;
export type ScreenplayId = Brand<string, "ScreenplayId">;
export type VersionId = Brand<string, "VersionId">;
export type BranchId = Brand<string, "BranchId">;
export type SceneId = Brand<string, "SceneId">;
export type CharacterId = Brand<string, "CharacterId">;
export type PredictionId = Brand<string, "PredictionId">;

// Result pattern for operations that can fail
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <E = Error>(error: E): Result<never, E> => ({
  ok: false,
  error,
});
