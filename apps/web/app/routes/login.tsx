import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";
import { LoginForm } from "~/features/auth/components/LoginForm";
import styles from "./_auth.module.css";

const fetchLoginData = createServerFn({ method: "GET" }).handler(async () => {
  const { getUser } = await import("~/server/context");
  const user = await getUser();
  return {
    isAuthenticated: !!user,
    availableProviders: [
      ...(process.env["GOOGLE_CLIENT_ID"] ? ["google"] : []),
      ...(process.env["GITHUB_CLIENT_ID"] ? ["github"] : []),
    ],
  };
});

export const Route = createFileRoute("/login")({
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
