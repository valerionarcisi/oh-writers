import { ForbiddenError, DbError, ValidationError } from "@oh-writers/utils";

export { ForbiddenError, DbError, ValidationError };

export class DocumentNotFoundError {
  readonly _tag = "DocumentNotFoundError" as const;
  readonly message: string;

  constructor(readonly id: string) {
    this.message = `Document not found: ${id}`;
  }
}

export type DocumentsError =
  | DocumentNotFoundError
  | ForbiddenError
  | ValidationError
  | DbError;
