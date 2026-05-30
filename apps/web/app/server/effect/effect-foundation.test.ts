import { describe, it, expect } from "vitest";
import { Context, Effect, Exit, Layer } from "effect";
import { errAsync, okAsync } from "neverthrow";
import { fromResultAsync, toResultAsync } from "./interop";
import { exitToShape, runEffectToShape } from "./acl";

// A representative domain error: a plain tagged value object, exactly like the
// neverthrow errors the AI context carries across the boundary.
class SampleError {
  readonly _tag = "SampleError" as const;
  readonly message: string;
  constructor(readonly reason: string) {
    this.message = `Sample failed: ${reason}`;
  }
}

describe("[OHW-048] Effect foundation — neverthrow⇄Effect bridge", () => {
  it("lifts an ok ResultAsync into Effect success", async () => {
    const exit = await Effect.runPromiseExit(fromResultAsync(okAsync(42)));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(exit.value).toBe(42);
  });

  it("lifts an err ResultAsync into the Effect failure channel (tag preserved)", async () => {
    const exit = await Effect.runPromiseExit(
      fromResultAsync(errAsync(new SampleError("boom"))),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    const shape = exitToShape(exit);
    expect(shape.isOk).toBe(false);
    if (!shape.isOk) {
      expect(shape.error).toBeInstanceOf(SampleError);
      expect(shape.error._tag).toBe("SampleError");
    }
  });

  it("reverse bridge: an Effect success → ok ResultAsync", async () => {
    const result = await toResultAsync(Effect.succeed(7));
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe(7);
  });

  it("reverse bridge: a typed Effect failure → err ResultAsync (tag preserved)", async () => {
    const result = await toResultAsync(Effect.fail(new SampleError("back")));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(SampleError);
      expect(result.error._tag).toBe("SampleError");
    }
  });

  it("reverse bridge: a defect re-rejects the original value (programming error)", async () => {
    const original = new Error("boom-defect");
    await expect(toResultAsync(Effect.die(original))).rejects.toBe(original);
  });
});

describe("[OHW-048] Effect foundation — ACL Exit → ResultShape", () => {
  it("converts Effect success → ok shape", async () => {
    const shape = await runEffectToShape(Effect.succeed({ id: "x" }));
    expect(shape.isOk).toBe(true);
    if (shape.isOk) expect(shape.value).toEqual({ id: "x" });
  });

  it("converts a typed failure → err shape carrying the _tag", async () => {
    const shape = await runEffectToShape(Effect.fail(new SampleError("nope")));
    expect(shape.isOk).toBe(false);
    if (!shape.isOk) {
      expect(shape.error._tag).toBe("SampleError");
      expect(shape.error.message).toBe("Sample failed: nope");
    }
  });

  it("re-throws the original defect value (programming error), never fabricates a domain error", async () => {
    const original = new Error("unexpected");
    await expect(runEffectToShape(Effect.die(original))).rejects.toBe(original);
  });
});

describe("[OHW-048] Effect foundation — typed requirement provision", () => {
  // A substitute service proves the R-channel provision mechanism without a
  // live DB: an Effect that *requires* the service only runs once a Layer
  // providing it is supplied.
  interface Greeter {
    readonly greet: (name: string) => string;
  }
  const Greeter = Context.GenericTag<Greeter>("test/Greeter");
  const GreeterLayer = Layer.succeed(Greeter, {
    greet: (name) => `ciao ${name}`,
  });

  it("resolves an Effect that depends on a provided service", async () => {
    const program = Effect.gen(function* () {
      const greeter = yield* Greeter;
      return greeter.greet("Cesare");
    });
    const shape = await runEffectToShape(Effect.provide(program, GreeterLayer));
    expect(shape.isOk).toBe(true);
    if (shape.isOk) expect(shape.value).toBe("ciao Cesare");
  });

  it("propagates a typed failure raised inside a service-dependent Effect", async () => {
    const program = Effect.gen(function* () {
      yield* Greeter;
      return yield* Effect.fail(new SampleError("inside service"));
    });
    const shape = await runEffectToShape(Effect.provide(program, GreeterLayer));
    expect(shape.isOk).toBe(false);
    if (!shape.isOk) expect(shape.error._tag).toBe("SampleError");
  });
});
