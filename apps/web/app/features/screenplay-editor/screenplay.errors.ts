import { ForbiddenError, DbError } from "@oh-writers/utils";
import { ProjectNotFoundError } from "~/features/projects/projects.errors";

export { ForbiddenError, DbError, ProjectNotFoundError };

// Strictly: a screenplay row is missing for an existing, accessible project.
// Project-absent and version-absent paths use ProjectNotFoundError /
// VersionNotFoundError respectively — do not reuse this tag for those.
export class ScreenplayNotFoundError {
  readonly _tag = "ScreenplayNotFoundError" as const;
  readonly message: string;

  constructor(readonly id: string) {
    this.message = `Screenplay not found: ${id}`;
  }
}

export type ScreenplayError =
  | ScreenplayNotFoundError
  | ProjectNotFoundError
  | ForbiddenError
  | DbError;
