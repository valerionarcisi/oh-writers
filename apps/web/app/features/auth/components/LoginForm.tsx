import { useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { useHydratedInput } from "@oh-writers/ui";
import { authClient } from "~/lib/auth-client";
import { useTranslation } from "~/features/i18n";
import { PasswordInput } from "./PasswordInput";
import styles from "./LoginForm.module.css";

interface LoginFormProps {
  availableProviders: string[];
}

export function LoginForm({ availableProviders }: LoginFormProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const emailSchema = z.object({
    email: z.string().email(t("auth.validation.emailInvalid")),
  });
  const passwordSchema = z.object({
    password: z.string().min(1, t("auth.validation.passwordRequired")),
  });
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Server-rendered + autofocused: anything typed before React wires onChange
  // would otherwise sit in the field while `email` stays empty, and the form
  // would submit the wrong (empty) value (#117).
  const emailRef = useRef<HTMLInputElement>(null);
  useHydratedInput(emailRef, email, setEmail);

  const handleEmailContinue = (e: React.FormEvent) => {
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
    setApiError(null);
    setStep("password");
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = passwordSchema.safeParse({ password });
    if (!result.success) {
      setPasswordError(
        result.error.issues[0]?.message ??
          t("auth.validation.passwordRequiredShort"),
      );
      return;
    }
    setPasswordError(null);
    setApiError(null);
    setIsSubmitting(true);

    const signInResult = await authClient.signIn.email({ email, password });
    setIsSubmitting(false);

    if (signInResult.error) {
      setApiError(t("auth.error.invalidCredentials"));
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
    <div className={styles.card}>
      {/* Logo / wordmark */}
      <div className={styles.brand}>
        <span className={styles.brandMark}>O</span>
        <span className={styles.brandName}>Oh Writers</span>
      </div>

      <div className={styles.headingBlock}>
        <h1 className={styles.heading}>
          {step === "email"
            ? t("auth.login.headingSignIn")
            : t("auth.login.headingWelcomeBack")}
        </h1>
        {step === "password" && (
          <p className={styles.emailPill}>
            {email}
            <button
              type="button"
              className={styles.changeEmail}
              onClick={() => {
                setStep("email");
                setApiError(null);
                setPasswordError(null);
              }}
            >
              {t("auth.login.changeEmail")}
            </button>
          </p>
        )}
      </div>

      {apiError && <p className={styles.apiError}>{apiError}</p>}

      {step === "email" ? (
        <form onSubmit={handleEmailContinue} className={styles.form} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              {t("auth.field.email")}
            </label>
            <input
              ref={emailRef}
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

          <button type="submit" className={styles.primaryBtn}>
            {t("auth.action.continue")}
          </button>

          {availableProviders.length > 0 && (
            <>
              <div className={styles.divider}>
                <span>{t("auth.divider.or")}</span>
              </div>
              <div className={styles.oauthGroup}>
                {availableProviders.includes("google") && (
                  <button
                    type="button"
                    className={styles.oauthBtn}
                    onClick={() => handleOAuth("google")}
                  >
                    <GoogleIcon />
                    {t("auth.oauth.continueGoogle")}
                  </button>
                )}
                {availableProviders.includes("github") && (
                  <button
                    type="button"
                    className={styles.oauthBtn}
                    onClick={() => handleOAuth("github")}
                  >
                    {t("auth.oauth.continueGithub")}
                  </button>
                )}
              </div>
            </>
          )}
        </form>
      ) : (
        <form
          onSubmit={handlePasswordSubmit}
          className={styles.form}
          noValidate
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              {t("auth.field.password")}
            </label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              autoFocus
              hasError={!!passwordError}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
              }}
              placeholder="••••••••"
            />
            {passwordError && (
              <span className={styles.fieldError}>{passwordError}</span>
            )}
          </div>

          <Link to="/forgot-password" className={styles.forgotPassword}>
            {t("auth.login.forgotPassword")}
          </Link>

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={isSubmitting}
          >
            {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>
        </form>
      )}

      <p className={styles.footer}>
        {t("auth.login.noAccount")}{" "}
        <Link to="/register" className={styles.footerLink}>
          {t("auth.login.register")}
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
