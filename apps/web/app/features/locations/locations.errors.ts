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
