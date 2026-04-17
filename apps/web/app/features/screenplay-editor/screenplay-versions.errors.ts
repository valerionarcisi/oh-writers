import { ForbiddenError, DbError, ValidationError } from "@oh-writers/utils";

export { ForbiddenError, DbError, ValidationError };

export class VersionNotFoundError {
  readonly _tag = "VersionNotFoundError" as const;
  readonly message: string;

  constructor(readonly id: string) {
    this.message = `Version not found: ${id}`;
  }
}

export class CannotDeleteLastManualError {
  readonly _tag = "CannotDeleteLastManualError" as const;
  readonly message: string;

  constructor() {
    this.message = "Cannot delete the only manual version";
  }
}

export type VersionsError =
  | VersionNotFoundError
  | CannotDeleteLastManualError
  | ForbiddenError
  | ValidationError
  | DbError;
