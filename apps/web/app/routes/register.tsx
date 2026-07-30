import { createFileRoute, redirect } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { RegisterForm, fetchIsAuthenticated } from "~/features/auth";
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
