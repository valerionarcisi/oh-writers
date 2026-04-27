import {
  ForbiddenError,
  DbError,
  ValidationError,
  RateLimitedError,
} from "@oh-writers/utils";

export { ForbiddenError, DbError, ValidationError, RateLimitedError };

export class BreakdownSceneNotFoundError {
  readonly _tag = "BreakdownSceneNotFoundError" as const;
  readonly message: string;
  constructor(readonly sceneId: string) {
    this.message = `Scene not found: ${sceneId}`;
  }
}

export class BreakdownElementNotFoundError {
  readonly _tag = "BreakdownElementNotFoundError" as const;
  readonly message: string;
  constructor(readonly elementId: string) {
    this.message = `Breakdown element not found: ${elementId}`;
  }
}
