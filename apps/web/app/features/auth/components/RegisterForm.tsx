import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@oh-writers/ui";
import { authClient } from "~/lib/auth-client";
import styles from "./RegisterForm.module.css";

const RegisterSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormValues = z.infer<typeof RegisterSchema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>({
    name: "",
    email: "",
    password: "",
  });
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
    const result = RegisterSchema.safeParse(values);
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
    const { error } = await authClient.signUp.email({
      name: result.data.name,
      email: result.data.email,
      password: result.data.password,
    });
    setIsSubmitting(false);

    if (error) {
      setApiError(error.message ?? "Failed to create account");
      return;
    }

    router.navigate({ to: "/dashboard" });
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.logo}>Oh Writers</span>
        <h1 className={styles.heading}>Create account</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {apiError && <p className={styles.apiError}>{apiError}</p>}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="name">
            Name <span className={styles.required}>*</span>
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            className={`${styles.input} ${errors.name ? styles.inputError : ""}`}
            value={values.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="Jane Smith"
            autoFocus
          />
          {errors.name && (
            <span className={styles.fieldError}>{errors.name}</span>
          )}
        </div>

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
            autoComplete="new-password"
            className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
            value={values.password}
            onChange={(e) => setField("password", e.target.value)}
            placeholder="Min. 8 characters"
          />
          {errors.password && (
            <span className={styles.fieldError}>{errors.password}</span>
          )}
        </div>

        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className={styles.footer}>
        Already have an account?{" "}
        <Link to="/login" className={styles.link}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
