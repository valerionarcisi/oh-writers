import { createFileRoute, Outlet } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";

export const Route = createFileRoute("/_app/projects/$id_/screenplay")({
  head: () => titleHead("Sceneggiatura"),
  component: () => <Outlet />,
});
