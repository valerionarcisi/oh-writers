import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { authClient } from "~/lib/auth-client";
import { useTranslation } from "~/features/i18n";
import { BrandWordmark } from "@oh-writers/ui";
import styles from "./LoginForm.module.css";

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const emailSchema = z.object({
    email: z.string().email(t("auth.validation.emailInvalid")),
  });
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = emailSchema.safeParse({ email });
    if (!result.success) {
      setEmailError(
        result.error.issues[0]?.message ??
          t("auth.validation.emailInvalidShort"),
      );
      return;
    }
    setEmailError(null);
    setIsSubmitting(true);
    // better-auth returns { status: true } regardless of whether the email
    // exists — do not branch on the result, or this leaks account existence.
    await authClient.requestPasswordReset({
      email: result.data.email,
      redirectTo: "/reset-password",
    });
    setIsSubmitting(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className={styles.card}>
        <div className={styles.brand}>
          <BrandWordmark className={styles.brandWordmark} />
        </div>
        <div className={styles.headingBlock}>
          <h1 className={styles.heading}>
            {t("auth.forgotPassword.sentHeading")}
          </h1>
        </div>
        <p className={styles.footer}>
          {t("auth.forgotPassword.sentMessage")} <strong>{email}</strong>
        </p>
        <p className={styles.footer}>
          <Link to="/login" className={styles.footerLink}>
            {t("auth.forgotPassword.backToLogin")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.brand}>
        <BrandWordmark className={styles.brandWordmark} />
      </div>
      <div className={styles.headingBlock}>
        <h1 className={styles.heading}>{t("auth.forgotPassword.heading")}</h1>
      </div>
      <p className={styles.footer}>{t("auth.forgotPassword.instructions")}</p>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            {t("auth.field.email")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            className={`${styles.input} ${emailError ? styles.inputError : ""}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
            placeholder={t("auth.placeholder.email")}
          />
          {emailError && (
            <span className={styles.fieldError}>{emailError}</span>
          )}
        </div>

        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? t("auth.forgotPassword.submitting")
            : t("auth.forgotPassword.submit")}
        </button>
      </form>

      <p className={styles.footer}>
        <Link to="/login" className={styles.footerLink}>
          {t("auth.forgotPassword.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
