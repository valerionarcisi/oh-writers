import { createFileRoute } from "@tanstack/react-router";
import { UserSettingsPage } from "~/features/user-settings";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext() as { user: { name: string; email: string } };

  return (
    <UserSettingsPage
      userName={user.name}
      userEmail={user.email}
    />
  );
}
