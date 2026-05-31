import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { DashboardPage } from "~/features/projects";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => titleHead("Dashboard"),
  component: DashboardPage,
});
