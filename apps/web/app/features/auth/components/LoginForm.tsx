import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@oh-writers/ui";
import { authClient } from "~/lib/auth-client";
import styles from "./LoginForm.module.css";

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof LoginSchema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

interface LoginFormProps {
  availableProviders: string[];
}

export function LoginForm({ availableProviders }: LoginFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>({ email: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = <K extends keyof FormValues>(key: K, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setApiError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = LoginSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FormValues;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    const { error } = await authClient.signIn.email({
      email: result.data.email,
      password: result.data.password,
    });
    setIsSubmitting(false);

    if (error) {
      setApiError("Invalid email or password");
      return;
    }

    router.navigate({ to: "/dashboard" });
  };

  const handleOAuth = (provider: string) => {
    authClient.signIn.social({
      provider: provider as "google" | "github",
      callbackURL: "/dashboard",
    });
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.logo}>Oh Writers</span>
        <h1 className={styles.heading}>Sign in</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {apiError && <p className={styles.apiError}>{apiError}</p>}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Email <span className={styles.required}>*</span>
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
            value={values.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder="you@example.com"
            autoFocus
          />
          {errors.email && (
            <span className={styles.fieldError}>{errors.email}</span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Password <span className={styles.required}>*</span>
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
            value={values.password}
            onChange={(e) => setField("password", e.target.value)}
            placeholder="••••••••"
          />
          {errors.password && (
            <span className={styles.fieldError}>{errors.password}</span>
          )}
        </div>

        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {availableProviders.length > 0 && (
        <div className={styles.oauth}>
          <div className={styles.divider}>
            <span className={styles.dividerLabel}>or continue with</span>
          </div>
          <div className={styles.oauthButtons}>
            {availableProviders.includes("google") && (
              <button
                type="button"
                className={styles.oauthBtn}
                onClick={() => handleOAuth("google")}
              >
                Google
              </button>
            )}
            {availableProviders.includes("github") && (
              <button
                type="button"
                className={styles.oauthBtn}
                onClick={() => handleOAuth("github")}
              >
                GitHub
              </button>
            )}
          </div>
        </div>
      )}

      <p className={styles.footer}>
        No account?{" "}
        <Link to="/register" className={styles.link}>
          Create one
        </Link>
      </p>
    </div>
  );
}
