import { ForbiddenError, DbError } from "@oh-writers/utils";

export { ForbiddenError, DbError };

export class ScreenplayNotFoundError {
  readonly _tag = "ScreenplayNotFoundError" as const;
  readonly message: string;

  constructor(readonly id: string) {
    this.message = `Screenplay not found: ${id}`;
  }
}

export type ScreenplayError =
  | ScreenplayNotFoundError
  | ForbiddenError
  | DbError;
