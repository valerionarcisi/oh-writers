// Effect-TS foundation for the AI bounded context (ADR 48 / Wave E1).
// Everything the AI Effects need to run behind the `createServerFn` seam:
// the foundation Layers, the neverthrow⇄Effect bridge, and the single ACL that
// converts an Effect result into the canonical `ResultShape`.

export { fromResultAsync } from "./interop";
export { DbService, DbLayer } from "./db.layer";
export { AccessService, AccessLayer } from "./access.layer";
export { AnthropicClient, AnthropicClientLayer } from "./anthropic.layer";
export { Observability, ObservabilityLayer } from "./langfuse.layer";
export {
  AiContextLayer,
  runAiEffect,
  runEffectToShape,
  exitToShape,
} from "./acl";
