import { createFileRoute, redirect } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { LoginForm } from "~/features/auth";
import { fetchLoginData } from "~/features/auth/server/auth-routes.server";
import styles from "./_auth.module.css";

export const Route = createFileRoute("/login")({
  head: () => titleHead("Accedi"),
  loader: async () => {
    const data = await fetchLoginData();
    if (data.isAuthenticated) throw redirect({ to: "/dashboard" });
    return { availableProviders: data.availableProviders };
  },
  component: LoginPage,
});

function LoginPage() {
  const { availableProviders } = Route.useLoaderData();
  return (
    <div className={styles.page}>
      <LoginForm availableProviders={availableProviders} />
    </div>
  );
}
