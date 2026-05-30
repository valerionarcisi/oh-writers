import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { TeamCreationPage } from "~/features/teams";

export const Route = createFileRoute("/_app/teams/new")({
  head: () => titleHead("Nuovo team"),
  component: TeamCreationPage,
});
