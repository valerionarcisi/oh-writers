import { useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { useHydratedInput, BrandWordmark } from "@oh-writers/ui";
import { authClient } from "~/lib/auth-client";
import { useTranslation } from "~/features/i18n";
import { SplashScreen } from "./SplashScreen";
import { PasswordInput } from "./PasswordInput";
import { OAuthButtons } from "./OAuthButtons";
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

  return (
    <>
      <SplashScreen />
      <div className={styles.card}>
        {/* Brand wordmark (#134) */}
        <div className={styles.brand}>
          <BrandWordmark className={styles.brandWordmark} />
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
          <form
            onSubmit={handleEmailContinue}
            className={styles.form}
            noValidate
          >
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

            <OAuthButtons
              availableProviders={availableProviders}
              callbackURL="/dashboard"
            />
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
              {isSubmitting
                ? t("auth.login.submitting")
                : t("auth.login.submit")}
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
    </>
  );
}
