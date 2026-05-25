import { ForbiddenError, DbError } from "@oh-writers/utils";

export { ForbiddenError, DbError };

export class TeamNotFoundError {
  readonly _tag = "TeamNotFoundError" as const;
  readonly message: string;

  constructor(readonly slug: string) {
    this.message = `Team not found: ${slug}`;
  }
}

export class TeamMemberNotFoundError {
  readonly _tag = "TeamMemberNotFoundError" as const;
  readonly message: string;

  constructor(
    readonly teamId: string,
    readonly userId: string,
  ) {
    this.message = `Team member not found: ${userId} in team ${teamId}`;
  }
}

export class InvitationNotFoundError {
  readonly _tag = "InvitationNotFoundError" as const;
  readonly message: string;

  constructor(readonly token: string) {
    this.message = `Invitation not found: ${token}`;
  }
}

export class InvitationExpiredError {
  readonly _tag = "InvitationExpiredError" as const;
  readonly message = "Invitation has expired";
}

export class InvitationAlreadyAcceptedError {
  readonly _tag = "InvitationAlreadyAcceptedError" as const;
  readonly message = "Invitation has already been accepted";
}

export class AlreadyMemberError {
  readonly _tag = "AlreadyMemberError" as const;
  readonly message: string;

  constructor(readonly email: string) {
    this.message = `User ${email} is already a team member`;
  }
}

export class LastOwnerError {
  readonly _tag = "LastOwnerError" as const;
  readonly message =
    "Cannot remove or demote the last owner. Transfer ownership first.";
}

export class SlugConflictError {
  readonly _tag = "SlugConflictError" as const;
  readonly message: string;

  constructor(readonly slug: string) {
    this.message = `Team slug already taken: ${slug}`;
  }
}

export type TeamsError =
  | TeamNotFoundError
  | TeamMemberNotFoundError
  | InvitationNotFoundError
  | InvitationExpiredError
  | InvitationAlreadyAcceptedError
  | AlreadyMemberError
  | LastOwnerError
  | SlugConflictError
  | ForbiddenError
  | DbError;
