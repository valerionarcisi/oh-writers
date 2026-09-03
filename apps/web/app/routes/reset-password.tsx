import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { titleHead } from "~/lib/document-title";
import { ResetPasswordForm } from "~/features/auth";
import styles from "./_auth.module.css";

// better-auth's GET /api/auth/reset-password/:token redirects here with the
// token appended as a query param — see packages/auth/src/index.ts
// (sendResetPassword) and ForgotPasswordForm's redirectTo. `error` shows up
// instead of `token` when better-auth already rejected it (expired/used)
// before the redirect — ResetPasswordForm treats a missing token from either
// cause the same way (invalid-link state).
const searchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  head: () => titleHead("Reimposta password"),
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  // The route's search schema stays `string | undefined` — every route in
  // this app shares one search-param union (TanStack Router unifies
  // `validateSearch` across routes into a single type), and `token` is
  // already used with that shape elsewhere. Narrow to `null` only here, at
  // ResetPasswordForm's boundary, rather than changing the shared type.
  return (
    <div className={styles.page}>
      <ResetPasswordForm token={token ?? null} />
    </div>
  );
}
