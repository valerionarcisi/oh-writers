import { ForbiddenError, DbError } from "@oh-writers/utils";

export { ForbiddenError, DbError };

export class ScheduleNotFoundError {
  readonly _tag = "ScheduleNotFoundError" as const;
  readonly message: string;
  constructor(readonly projectId: string) {
    this.message = `Schedule not found for project: ${projectId}`;
  }
}

export class StripNotFoundError {
  readonly _tag = "StripNotFoundError" as const;
  readonly message: string;
  constructor(readonly stripId: string) {
    this.message = `Strip not found: ${stripId}`;
  }
}

export class ShootingDayNotFoundError {
  readonly _tag = "ShootingDayNotFoundError" as const;
  readonly message: string;
  constructor(readonly dayId: string) {
    this.message = `Shooting day not found: ${dayId}`;
  }
}

export class ScheduleLockedError {
  readonly _tag = "ScheduleLockedError" as const;
  readonly message = "Schedule is locked and cannot be modified";
}

export class NoScenesError {
  readonly _tag = "NoScenesError" as const;
  readonly message = "Cannot generate schedule: no scenes found in screenplay";
}
