import { createFileRoute, redirect } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { RegisterForm, fetchLoginData } from "~/features/auth";
import styles from "./_auth.module.css";

export const Route = createFileRoute("/register")({
  head: () => titleHead("Registrati"),
  loader: async () => {
    const data = await fetchLoginData();
    if (data.isAuthenticated) throw redirect({ to: "/dashboard" });
    return { availableProviders: data.availableProviders };
  },
  component: RegisterPage,
});

function RegisterPage() {
  const { availableProviders } = Route.useLoaderData();
  return (
    <div className={styles.page}>
      <RegisterForm availableProviders={availableProviders} />
    </div>
  );
}
