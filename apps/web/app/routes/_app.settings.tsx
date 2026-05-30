import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { UserSettingsPage } from "~/features/user-settings";

export const Route = createFileRoute("/_app/settings")({
  head: () => titleHead("Impostazioni"),
  component: SettingsPage,
});

const appRoute = getRouteApi("/_app");

function SettingsPage() {
  const { user } = appRoute.useLoaderData();

  return <UserSettingsPage userName={user.name} userEmail={user.email} />;
}
