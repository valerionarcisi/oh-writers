import { ForbiddenError, DbError } from "@oh-writers/utils";

export { ForbiddenError, DbError };

export class BudgetNotFoundError {
  readonly _tag = "BudgetNotFoundError" as const;
  readonly message: string;
  constructor(readonly projectId: string) {
    this.message = `Budget not found for project: ${projectId}`;
  }
}

export class BudgetLineNotFoundError {
  readonly _tag = "BudgetLineNotFoundError" as const;
  readonly message: string;
  constructor(readonly lineId: string) {
    this.message = `Budget line not found: ${lineId}`;
  }
}

export class BudgetLockedError {
  readonly _tag = "BudgetLockedError" as const;
  readonly message = "Budget is locked and cannot be modified";
}

export class NoBreakdownError {
  readonly _tag = "NoBreakdownError" as const;
  readonly message = "Cannot generate budget: no breakdown elements found";
}
