import { ForbiddenError, DbError } from "@oh-writers/utils";

export { ForbiddenError, DbError };

export class LocationRequirementNotFoundError {
  readonly _tag = "LocationRequirementNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Location requirement not found: ${id}`;
  }
}

export class LocationCandidateNotFoundError {
  readonly _tag = "LocationCandidateNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Location candidate not found: ${id}`;
  }
}

export class LocationNormalisationError {
  readonly _tag = "LocationNormalisationError" as const;
  readonly message: string;
  constructor(
    readonly projectId: string,
    cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    this.message = `Location normalisation failed for project ${projectId}: ${reason}`;
  }
}
