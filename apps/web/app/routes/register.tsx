import { createFileRoute, redirect } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { RegisterForm } from "~/features/auth";
import { fetchIsAuthenticated } from "~/features/auth/server/auth-routes.server";
import styles from "./_auth.module.css";

export const Route = createFileRoute("/register")({
  head: () => titleHead("Registrati"),
  loader: async () => {
    const isAuthenticated = await fetchIsAuthenticated();
    if (isAuthenticated) throw redirect({ to: "/dashboard" });
    return {};
  },
  component: RegisterPage,
});

function RegisterPage() {
  return (
    <div className={styles.page}>
      <RegisterForm />
    </div>
  );
}
