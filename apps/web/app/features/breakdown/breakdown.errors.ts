import { ForbiddenError, DbError, ValidationError } from "@oh-writers/utils";

export { ForbiddenError, DbError, ValidationError };

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

export class BreakdownRateLimitedError {
  readonly _tag = "BreakdownRateLimitedError" as const;
  readonly message: string;
  constructor(readonly retryAfterMs: number) {
    this.message = `Rate limited; retry in ${Math.ceil(retryAfterMs / 1000)}s`;
  }
}

export class BreakdownVersionNotFoundError {
  readonly _tag = "BreakdownVersionNotFoundError" as const;
  readonly message: string;
  constructor(readonly versionId: string) {
    this.message = `Screenplay version not found: ${versionId}`;
  }
}

export class LlmSpoglioFailedError {
  readonly _tag = "LlmSpoglioFailedError" as const;
  readonly message: string;
  constructor(readonly cause: string) {
    this.message = `LLM spoglio failed: ${cause}`;
  }
}
