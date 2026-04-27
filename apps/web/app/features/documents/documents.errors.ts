import {
  ForbiddenError,
  DbError,
  ValidationError,
  RateLimitedError,
} from "@oh-writers/utils";

export { ForbiddenError, DbError, ValidationError, RateLimitedError };

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

export type DocumentsError =
  | DocumentNotFoundError
  | SubjectNotFoundError
  | RateLimitedError
  | ForbiddenError
  | ValidationError
  | DbError;
