import type { Result } from "neverthrow";

// JSON-serializable discriminated union for createServerFn boundaries.
// neverthrow's Result has methods (.isOk(), .map(), etc.) that don't survive
// JSON round-trips. We convert at the server boundary to this plain shape.

export type OkShape<T> = { readonly isOk: true; readonly value: T };
export type ErrShape<E> = { readonly isOk: false; readonly error: E };
export type ResultShape<T, E> = OkShape<T> | ErrShape<E>;

// Server boundary: neverthrow Result → wire-safe shape
export const toShape = <T, E>(result: Result<T, E>): ResultShape<T, E> =>
  result.isOk()
    ? { isOk: true as const, value: result.value }
    : { isOk: false as const, error: result.error };

// Client boundary: wire-safe shape → value or throw (for TanStack Query mutations)
export const unwrapResult = <T>(result: {
  isOk: boolean;
  value?: T;
  error?: { message: string };
}): T => {
  if (!result.isOk) {
    const domainError = result.error!;
    throw Object.assign(new Error(domainError.message), domainError);
  }
  return result.value as T;
};
