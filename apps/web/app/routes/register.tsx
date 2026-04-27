import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import { RegisterForm } from "~/features/auth";
import styles from "./_auth.module.css";

const fetchIsAuthenticated = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getUser } = await import("~/server/context");
    const user = await getUser();
    return !!user;
  },
);

export const Route = createFileRoute("/register")({
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
