import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { AiUsageStatsPage } from "~/features/ai-providers";

export const Route = createFileRoute("/_app/settings_/ai_/stats")({
  head: () => titleHead("Statistiche AI"),
  component: AiUsageStatsPage,
});
