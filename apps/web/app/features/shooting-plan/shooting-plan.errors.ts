import { ForbiddenError, DbError } from "@oh-writers/utils";

export { ForbiddenError, DbError };

export class ShotPlanNotFoundError {
  readonly _tag = "ShotPlanNotFoundError" as const;
  readonly message: string;
  constructor(readonly sceneId: string) {
    this.message = `Shot plan not found for scene: ${sceneId}`;
  }
}

export class ScenarioNotFoundError {
  readonly _tag = "ScenarioNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Scenario not found: ${id}`;
  }
}

export class ShotNotFoundError {
  readonly _tag = "ShotNotFoundError" as const;
  readonly message: string;
  constructor(readonly id: string) {
    this.message = `Shot not found: ${id}`;
  }
}

export class InvalidReverseShotError {
  readonly _tag = "InvalidReverseShotError" as const;
  readonly message: string;
  constructor(reason: string) {
    this.message = `Cannot create reverse shot: ${reason}`;
  }
}

export class BlockingNotFoundError {
  readonly _tag = "BlockingNotFoundError" as const;
  readonly message: string;
  constructor(readonly sceneId: string) {
    this.message = `Blocking not found for scene: ${sceneId}`;
  }
}
