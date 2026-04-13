import { ForbiddenError, DbError } from "@oh-writers/utils";

export { ForbiddenError, DbError };

export class ProjectNotFoundError {
  readonly _tag = "ProjectNotFoundError" as const;
  readonly message: string;

  constructor(readonly id: string) {
    this.message = `Project not found: ${id}`;
  }
}

export type ProjectsError = ProjectNotFoundError | ForbiddenError | DbError;
