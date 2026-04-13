import { ForbiddenError, DbError } from "@oh-writers/utils";

export { ForbiddenError, DbError };

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
  | DbError;
