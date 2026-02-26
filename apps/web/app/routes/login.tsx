import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginForm } from "~/features/auth/components/LoginForm";
import { getUser } from "~/server/context";
import styles from "./_auth.module.css";

export const Route = createFileRoute("/login")({
  loader: async () => {
    const user = await getUser();
    if (user) throw redirect({ to: "/dashboard" });
    return {
      availableProviders: [
        ...(process.env["GOOGLE_CLIENT_ID"] ? ["google"] : []),
        ...(process.env["GITHUB_CLIENT_ID"] ? ["github"] : []),
      ],
    };
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
