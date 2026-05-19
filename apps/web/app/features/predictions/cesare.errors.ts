// Cesare-specific error class.
// Lives in its own file (not cesare.server.ts) to avoid circular imports:
// every cesare-*-tools.ts file needs this error type, and cesare.server.ts
// imports all of them. Pulling the class out breaks the cycle.

export class CesareError {
  readonly _tag = "CesareError" as const;
  readonly message: string;
  constructor(readonly cause: string) {
    this.message = `Cesare error: ${cause}`;
  }
}
