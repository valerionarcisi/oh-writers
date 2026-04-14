// Strip binary fields (yjsState, yjsSnapshot) before sending to client.
// These are bytea columns that don't survive JSON serialization meaningfully.
export const stripYjsState = <T extends { yjsState?: unknown }>({
  yjsState: _,
  ...rest
}: T): Omit<T, "yjsState"> => rest as Omit<T, "yjsState">;

export const stripYjsSnapshot = <T extends { yjsSnapshot?: unknown }>({
  yjsSnapshot: _,
  ...rest
}: T): Omit<T, "yjsSnapshot"> => rest as Omit<T, "yjsSnapshot">;
