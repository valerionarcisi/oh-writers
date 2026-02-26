import { createFileRoute, redirect } from "@tanstack/react-router";
import { RegisterForm } from "~/features/auth/components/RegisterForm";
import { getUser } from "~/server/context";
import styles from "./_auth.module.css";

export const Route = createFileRoute("/register")({
  loader: async () => {
    const user = await getUser();
    if (user) throw redirect({ to: "/dashboard" });
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
