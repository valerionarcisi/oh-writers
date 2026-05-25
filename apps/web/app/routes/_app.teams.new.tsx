import { createFileRoute } from "@tanstack/react-router";
import { TeamCreationPage } from "~/features/teams";

export const Route = createFileRoute("/_app/teams/new")({
  component: TeamCreationPage,
});
