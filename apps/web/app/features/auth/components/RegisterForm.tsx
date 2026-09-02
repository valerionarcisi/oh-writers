import { useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import type { TranslationKey } from "@oh-writers/domain";
import { Button, useHydratedInput } from "@oh-writers/ui";
import { authClient } from "~/lib/auth-client";
import { useTranslation } from "~/features/i18n";
import { PasswordInput } from "./PasswordInput";
import styles from "./RegisterForm.module.css";

const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  consent: z.boolean(),
});

type FormValues = z.infer<typeof RegisterSchema>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

/**
 * Pure schema builder, kept separate from the component so the consent
 * `.refine()` (and the rest of the validation) is testable without a router
 * or DOM — the seam this spec's tests target (Spec 88).
 */
export function buildRegisterSchema(t: (key: TranslationKey) => string) {
  return z
    .object({
      name: z
        .string()
        .min(1, t("auth.register.validation.nameRequired"))
        .max(100, t("auth.register.validation.nameTooLong")),
      email: z.string().email(t("auth.register.validation.emailInvalid")),
      password: z.string().min(8, t("auth.register.validation.passwordMin")),
      consent: z.boolean(),
    })
    .refine((data) => data.consent === true, {
      message: t("auth.register.validation.consentRequired"),
      path: ["consent"],
    });
}

export function RegisterForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const registerSchema = buildRegisterSchema(t);
  const [values, setValues] = useState<FormValues>({
    name: "",
    email: "",
    password: "",
    consent: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = <K extends "name" | "email" | "password">(
    key: K,
    value: string,
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setApiError(null);
  };

  const setConsent = (value: boolean) => {
    setValues((prev) => ({ ...prev, consent: value }));
    setErrors((prev) => ({ ...prev, consent: undefined }));
    setApiError(null);
  };

  // Server-rendered + autofocused: adopt anything typed before React wired its
  // onChange, or the name sits in the field while state stays empty (#117).
  const nameRef = useRef<HTMLInputElement>(null);
  useHydratedInput(nameRef, values.name, (next) => setField("name", next));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = registerSchema.safeParse(values);
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
    const signUpResult = await authClient.signUp.email({
      name: result.data.name,
      email: result.data.email,
      password: result.data.password,
    });
    setIsSubmitting(false);

    if (signUpResult.error) {
      setApiError(
        signUpResult.error.message ?? t("auth.register.error.createFailed"),
      );
      return;
    }

    router.navigate({ to: "/dashboard" });
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.logo}>Oh Writers</span>
        <h1 className={styles.heading}>{t("auth.register.heading")}</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {apiError && <p className={styles.apiError}>{apiError}</p>}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="name">
            {t("auth.register.fieldName")}{" "}
            <span className={styles.required}>*</span>
          </label>
          <input
            ref={nameRef}
            id="name"
            type="text"
            autoComplete="name"
            className={`${styles.input} ${errors.name ? styles.inputError : ""}`}
            value={values.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder={t("auth.register.placeholderName")}
            autoFocus
          />
          {errors.name && (
            <span className={styles.fieldError}>{errors.name}</span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            {t("auth.register.fieldEmail")}{" "}
            <span className={styles.required}>*</span>
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
            value={values.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder={t("auth.register.placeholderEmail")}
          />
          {errors.email && (
            <span className={styles.fieldError}>{errors.email}</span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            {t("auth.register.fieldPassword")}{" "}
            <span className={styles.required}>*</span>
          </label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            hasError={!!errors.password}
            value={values.password}
            onChange={(e) => setField("password", e.target.value)}
            placeholder={t("auth.register.placeholderPassword")}
          />
          {errors.password && (
            <span className={styles.fieldError}>{errors.password}</span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.consentLabel} htmlFor="consent">
            <input
              id="consent"
              type="checkbox"
              checked={values.consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              {t("auth.register.consentLabel")} (
              <Link to="/terms" className={styles.link}>
                {t("auth.register.consentTermsLink")}
              </Link>
              {", "}
              <Link to="/privacy" className={styles.link}>
                {t("auth.register.consentPrivacyLink")}
              </Link>
              )
            </span>
          </label>
          {errors.consent && (
            <span className={styles.fieldError}>{errors.consent}</span>
          )}
        </div>

        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting
            ? t("auth.register.submitting")
            : t("auth.register.submit")}
        </Button>
      </form>

      <p className={styles.footer}>
        {t("auth.register.haveAccount")}{" "}
        <Link to="/login" className={styles.link}>
          {t("auth.register.signIn")}
        </Link>
      </p>
    </div>
  );
}
