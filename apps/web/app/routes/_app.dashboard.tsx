import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "~/features/projects";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});
