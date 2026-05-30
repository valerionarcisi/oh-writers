import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseExporter } from "langfuse-vercel";
import { isLangfuseConfigured } from "./langfuse-config";

// Boot the OTEL NodeSDK with a Langfuse span exporter so every
// generateText / streamText call that sets experimental_telemetry.isEnabled
// emits structured traces (model, tokens, tool calls, latency) to Langfuse.
//
// This file must be imported before any AI SDK import — include it at the
// top of the server entry point (app.config.ts server plugin or entry.ts).
//
// Gated on Langfuse being configured: without both keys the exporter has no
// endpoint and the SDK logs noisy "[Langfuse SDK] Not found" lines in dev. When
// unconfigured we skip the SDK entirely — telemetry-enabled AI calls then emit
// to the default no-op OTEL tracer (spans are dropped silently, no error).
if (isLangfuseConfigured()) {
  const sdk = new NodeSDK({
    traceExporter: new LangfuseExporter({
      publicKey: process.env["LANGFUSE_PUBLIC_KEY"],
      secretKey: process.env["LANGFUSE_SECRET_KEY"],
      baseUrl: process.env["LANGFUSE_BASE_URL"] ?? "https://cloud.langfuse.com",
    }),
  });

  sdk.start();
}
