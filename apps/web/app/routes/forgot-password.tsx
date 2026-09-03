import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { ForgotPasswordForm } from "~/features/auth";
import styles from "./_auth.module.css";

export const Route = createFileRoute("/forgot-password")({
  head: () => titleHead("Password dimenticata"),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
    <div className={styles.page}>
      <ForgotPasswordForm />
    </div>
  );
}
