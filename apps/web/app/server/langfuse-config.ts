// apps/web/app/server/langfuse-config.ts
//
// Single source of truth for "is Langfuse observability configured?". Langfuse
// only works with BOTH a public and a secret key; without them the exporter
// has nowhere to send spans and the SDK logs noisy "[Langfuse SDK] Not found"
// lines in dev. Centralising the check here keeps the boot decision in one
// place (the instrumentation entry) instead of scattering env reads.
//
// Server-only — reads process.env. Never import from client code.

export function isLangfuseConfigured(): boolean {
  return Boolean(
    process.env["LANGFUSE_PUBLIC_KEY"] && process.env["LANGFUSE_SECRET_KEY"],
  );
}

/**
 * The `experimental_telemetry` object an AI SDK call should pass. Telemetry is
 * only enabled when Langfuse is configured — otherwise there's no exporter to
 * receive the spans, so emitting them is pure noise. Same `functionId` either
 * way so the trace name stays stable once observability is turned on.
 */
export function aiTelemetry(functionId: string): {
  readonly isEnabled: boolean;
  readonly functionId: string;
} {
  return { isEnabled: isLangfuseConfigured(), functionId };
}
