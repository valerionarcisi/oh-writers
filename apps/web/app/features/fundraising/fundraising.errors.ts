import { ForbiddenError, DbError } from "@oh-writers/utils";

export { ForbiddenError, DbError };

export class FundraisingSourceNotFoundError {
  readonly _tag = "FundraisingSourceNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Fundraising source not found: ${id}`;
  }
}

export class FundraisingFetchError {
  readonly _tag = "FundraisingFetchError" as const;
  readonly message: string;
  readonly cause: string;
  constructor(
    readonly feedUrl: string,
    cause: unknown,
  ) {
    this.cause = cause instanceof Error ? cause.message : String(cause);
    this.message = `Failed to fetch ${feedUrl}: ${this.cause}`;
  }
}

export class FundraisingParseError {
  readonly _tag = "FundraisingParseError" as const;
  readonly message: string;
  readonly cause: string;
  constructor(
    readonly feedUrl: string,
    cause: unknown,
  ) {
    this.cause = cause instanceof Error ? cause.message : String(cause);
    this.message = `Failed to parse ${feedUrl}: ${this.cause}`;
  }
}

export class FundraisingNotModifiedError {
  readonly _tag = "FundraisingNotModifiedError" as const;
  readonly message = "Feed not modified (304)";
  constructor(readonly feedUrl: string) {}
}

export class FundraisingCronAuthError {
  readonly _tag = "FundraisingCronAuthError" as const;
  readonly message = "Invalid cron secret";
}

export class ClassificationError {
  readonly _tag = "ClassificationError" as const;
  readonly message: string;
  readonly cause: string | null;
  constructor(
    readonly itemId: string,
    cause: unknown,
  ) {
    this.cause = cause instanceof Error ? cause.message : String(cause ?? null);
    this.message = `Classification failed for item ${itemId}: ${this.cause}`;
  }
}

export class FundraisingThrottledError {
  readonly _tag = "FundraisingThrottledError" as const;
  readonly message: string;
  constructor(
    readonly sourceId: string,
    readonly nextAllowedAt: Date,
  ) {
    this.message = `Source ${sourceId} throttled until ${nextAllowedAt.toISOString()}`;
  }
}
