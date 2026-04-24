import { ForbiddenError, DbError, ValidationError } from "@oh-writers/utils";

export { ForbiddenError, DbError, ValidationError };

export class DocumentNotFoundError {
  readonly _tag = "DocumentNotFoundError" as const;
  readonly message: string;

  constructor(readonly id: string) {
    this.message = `Document not found: ${id}`;
  }
}

export class SubjectNotFoundError {
  readonly _tag = "SubjectNotFoundError" as const;
  readonly message: string;

  constructor(readonly projectId: string) {
    this.message = `Soggetto not found for project ${projectId}`;
  }
}

export class SubjectRateLimitedError {
  readonly _tag = "SubjectRateLimitedError" as const;
  readonly message = "Rate limited: try again shortly";

  constructor(readonly retryAfterMs: number) {}
}

export type DocumentsError =
  | DocumentNotFoundError
  | SubjectNotFoundError
  | SubjectRateLimitedError
  | ForbiddenError
  | ValidationError
  | DbError;
