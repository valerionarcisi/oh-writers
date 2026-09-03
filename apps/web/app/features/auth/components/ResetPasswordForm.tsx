import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { authClient } from "~/lib/auth-client";
import { useTranslation } from "~/features/i18n";
import { PasswordInput } from "./PasswordInput";
import styles from "./LoginForm.module.css";

interface ResetPasswordFormProps {
  /** The token from the reset-password email link's `?token=` query param.
   *  `null` when the link is missing/malformed the query string entirely —
   *  distinct from better-auth rejecting a present-but-expired/used token,
   *  which surfaces as a submit-time API error instead. */
  token: string | null;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const passwordSchema = z.object({
    password: z.string().min(8, t("auth.resetPassword.validation.passwordMin")),
  });
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const result = passwordSchema.safeParse({ password });
    if (!result.success) {
      setPasswordError(
        result.error.issues[0]?.message ??
          t("auth.resetPassword.validation.passwordMin"),
      );
      return;
    }
    setPasswordError(null);
    setApiError(null);
    setIsSubmitting(true);

    const resetResult = await authClient.resetPassword({
      newPassword: result.data.password,
      token,
    });
    setIsSubmitting(false);

    if (resetResult.error) {
      setApiError(resetResult.error.message ?? t("auth.resetPassword.error"));
      return;
    }
    setSuccess(true);
  };

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>O</span>
          <span className={styles.brandName}>Oh Writers</span>
        </div>
        <p className={styles.apiError}>
          {t("auth.resetPassword.invalidToken")}
        </p>
        <p className={styles.footer}>
          <Link to="/forgot-password" className={styles.footerLink}>
            {t("auth.forgotPassword.heading")}
          </Link>
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>O</span>
          <span className={styles.brandName}>Oh Writers</span>
        </div>
        <p className={styles.footer}>{t("auth.resetPassword.success")}</p>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void router.navigate({ to: "/login" })}
        >
          {t("auth.forgotPassword.backToLogin")}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>O</span>
        <span className={styles.brandName}>Oh Writers</span>
      </div>
      <div className={styles.headingBlock}>
        <h1 className={styles.heading}>{t("auth.resetPassword.heading")}</h1>
      </div>

      {apiError && <p className={styles.apiError}>{apiError}</p>}

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            {t("auth.resetPassword.fieldPassword")}
          </label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            autoFocus
            hasError={!!passwordError}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError(null);
            }}
            placeholder={t("auth.resetPassword.placeholderPassword")}
          />
          {passwordError && (
            <span className={styles.fieldError}>{passwordError}</span>
          )}
        </div>

        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? t("auth.resetPassword.submitting")
            : t("auth.resetPassword.submit")}
        </button>
      </form>
    </div>
  );
}
