import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Button,
  Input,
  FormField,
  SegmentedControl,
  useConfirmDialog,
} from "@oh-writers/ui";
import { PasswordInput } from "~/features/auth";
import { unwrapResult } from "@oh-writers/utils";
import { teamRoleLabel, type Locale } from "@oh-writers/domain";
import { authClient } from "~/lib/auth-client";
import { useLocale, useTranslation } from "~/features/i18n";
import {
  updateUserProfile,
  updateUserLocale,
  userProfileQueryOptions,
  userAccountProvidersQueryOptions,
  userTeamsQueryOptions,
} from "../server/user-settings.server";
import styles from "./UserSettingsPage.module.css";

interface UserSettingsPageProps {
  userName: string;
  userEmail: string;
}

export function UserSettingsPage({
  userName,
  userEmail,
}: UserSettingsPageProps) {
  const profileQuery = useQuery(userProfileQueryOptions());
  const profile = profileQuery.data?.isOk ? profileQuery.data.value : null;

  const { t } = useTranslation();
  const name = profile?.name ?? userName;
  const email = profile?.email ?? userEmail;
  const avatarUrl = profile?.avatarUrl ?? null;

  return (
    <div className={styles.page} data-testid="user-settings-page">
      <div>
        <h1 className={styles.title}>{t("settings.title")}</h1>
        <p className={styles.subtitle}>{email}</p>
      </div>

      <div className={styles.grid} data-testid="user-settings-grid">
        <ProfileSection
          initialName={name}
          email={email}
          initialAvatarUrl={avatarUrl}
        />

        <LanguageSection />

        <AiSection />

        <PasswordSection />

        <TeamsSection />

        <DangerZoneSection />
      </div>
    </div>
  );
}

// ── Profile ────────────────────────────────────────────────────────────────

function ProfileSection({
  initialName,
  email,
  initialAvatarUrl,
}: {
  initialName: string;
  email: string;
  initialAvatarUrl: string | null;
}) {
  const { t } = useTranslation();
  const profileSchema = z.object({
    name: z
      .string()
      .min(1, t("settings.profile.validation.nameRequired"))
      .max(100, t("settings.profile.validation.nameMax")),
    avatarUrl: z
      .string()
      .url(t("settings.profile.validation.urlInvalid"))
      .or(z.literal(""))
      .transform((v) => (v === "" ? null : v))
      .nullable(),
  });
  const qc = useQueryClient();
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    avatarUrl?: string;
  }>({});
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const previewUrl = avatarUrl.trim() || null;

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = profileSchema.safeParse({
        name,
        avatarUrl: avatarUrl || null,
      });
      if (!parsed.success) {
        const errs = parsed.error.flatten().fieldErrors;
        setFieldErrors({
          name: errs.name?.[0],
          avatarUrl: errs.avatarUrl?.[0],
        });
        throw new Error("validation");
      }
      setFieldErrors({});
      return unwrapResult(
        await updateUserProfile({
          data: { name: parsed.data.name, avatarUrl: parsed.data.avatarUrl },
        }),
      );
    },
    onSuccess: () => {
      setSuccess(true);
      setApiError(null);
      void qc.invalidateQueries({ queryKey: ["user"] });
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (e) => {
      if ((e as Error).message !== "validation") {
        setApiError((e as Error).message ?? t("settings.profile.saveError"));
      }
    },
  });

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {t("settings.profile.sectionTitle")}
      </h2>

      <div className={styles.avatarRow}>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={t("settings.profile.avatarAlt")}
            className={styles.avatarPreview}
          />
        ) : (
          <div className={styles.avatarFallback}>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <FormField
          label={t("settings.profile.avatarUrlLabel")}
          htmlFor="avatar-url"
          error={fieldErrors.avatarUrl}
          className={styles.avatarField}
        >
          <Input
            id="avatar-url"
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            disabled={mut.isPending}
            hasError={!!fieldErrors.avatarUrl}
            data-testid="profile-avatar-url-input"
          />
        </FormField>
      </div>

      <div className={styles.fieldGroup}>
        <FormField
          label={t("settings.profile.nameLabel")}
          htmlFor="profile-name"
          error={fieldErrors.name}
        >
          <Input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={mut.isPending}
            hasError={!!fieldErrors.name}
            data-testid="profile-name-input"
          />
        </FormField>

        <div className={styles.emailField}>
          <span className={styles.fieldLabel}>
            {t("settings.profile.emailLabel")}
          </span>
          <span className={styles.readOnly} data-testid="profile-email">
            {email}
          </span>
        </div>
      </div>

      <div className={styles.formActions}>
        {success && (
          <span className={styles.successMsg} data-testid="profile-success-msg">
            {t("settings.profile.saved")}
          </span>
        )}
        {apiError && (
          <span className={styles.apiError} data-testid="profile-api-error">
            {apiError}
          </span>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          data-testid="save-profile-btn"
        >
          {mut.isPending
            ? t("settings.profile.saving")
            : t("settings.profile.save")}
        </Button>
      </div>
    </section>
  );
}

// ── Password ───────────────────────────────────────────────────────────────

// ── Language ─────────────────────────────────────────────────────────────────

function LanguageSection() {
  const { t } = useTranslation();
  const currentLocale = useLocale();
  const localeOptions: ReadonlyArray<{ id: Locale; label: string }> = [
    { id: "it", label: t("settings.language.optionIt") },
    { id: "en", label: t("settings.language.optionEn") },
  ];
  const [selected, setSelected] = useState<Locale>(currentLocale);

  const mut = useMutation({
    mutationFn: async (locale: Locale) =>
      unwrapResult(await updateUserLocale({ data: { locale } })),
    onSuccess: () => {
      // Locale is resolved server-side in the root loader and rendered into
      // `<html lang>`. React does not reconcile the `<html>` attribute on a
      // client-side loader re-run, so a hard reload is the reliable way to
      // re-resolve the locale end-to-end (lang, nav labels, market gates) from
      // the freshly-persisted value with no SSR/client desync.
      if (typeof window !== "undefined") window.location.reload();
    },
  });

  const onSelect = (locale: Locale): void => {
    setSelected(locale);
    if (locale !== currentLocale) mut.mutate(locale);
  };

  return (
    <section className={styles.section} data-testid="language-section">
      <h2 className={styles.sectionTitle}>
        {t("settings.language.sectionTitle")}
      </h2>
      <SegmentedControl<Locale>
        options={localeOptions}
        activeId={selected}
        onSelect={onSelect}
        ariaLabel={t("settings.language.ariaLabel")}
      />
    </section>
  );
}

// ── AI ─────────────────────────────────────────────────────────────────────

function AiSection() {
  const { t } = useTranslation();
  return (
    <section className={styles.section} data-testid="ai-section">
      <h2 className={styles.sectionTitle}>
        {t("settings.aiSection.sectionTitle")}
      </h2>
      <p className={styles.emptyState}>{t("settings.aiSection.description")}</p>
      <Link to="/settings/ai" data-testid="ai-settings-link">
        {t("settings.aiSection.manageLink")}
      </Link>
    </section>
  );
}

function PasswordSection() {
  const { t } = useTranslation();
  const providersQuery = useQuery(userAccountProvidersQueryOptions());
  const hasPassword =
    providersQuery.data?.isOk && providersQuery.data.value.hasPassword;

  const [fields, setFields] = useState({ current: "", next: "", confirm: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  if (providersQuery.isLoading) return null;
  if (!hasPassword) return null;

  const passwordSchema = z
    .object({
      current: z
        .string()
        .min(1, t("settings.password.validation.currentRequired")),
      next: z.string().min(8, t("settings.password.validation.nextMin")),
      confirm: z
        .string()
        .min(1, t("settings.password.validation.confirmRequired")),
    })
    .refine((d) => d.next === d.confirm, {
      message: t("settings.password.validation.mismatch"),
      path: ["confirm"],
    });

  const setField =
    (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setFields((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async () => {
    const parsed = passwordSchema.safeParse(fields);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const formErrs = parsed.error.flatten().formErrors;
      setFieldErrors({
        current: flat.current?.[0] ?? "",
        next: flat.next?.[0] ?? "",
        confirm: flat.confirm?.[0] ?? formErrs[0] ?? "",
      });
      return;
    }
    setFieldErrors({});
    setApiError(null);
    setIsPending(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: parsed.data.current,
        newPassword: parsed.data.next,
        revokeOtherSessions: false,
      });
      if (result.error) {
        setApiError(result.error.message ?? t("settings.password.changeError"));
      } else {
        setSuccess(true);
        setFields({ current: "", next: "", confirm: "" });
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setApiError(t("settings.password.changeError"));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {t("settings.password.sectionTitle")}
      </h2>

      <div className={styles.fieldGroup}>
        <FormField
          label={t("settings.password.currentLabel")}
          htmlFor="current-pwd"
          error={fieldErrors.current}
        >
          <PasswordInput
            id="current-pwd"
            autoComplete="current-password"
            value={fields.current}
            onChange={setField("current")}
            disabled={isPending}
            hasError={!!fieldErrors.current}
            data-testid="current-password-input"
          />
        </FormField>

        <FormField
          label={t("settings.password.newLabel")}
          htmlFor="new-pwd"
          error={fieldErrors.next}
        >
          <PasswordInput
            id="new-pwd"
            autoComplete="new-password"
            value={fields.next}
            onChange={setField("next")}
            disabled={isPending}
            hasError={!!fieldErrors.next}
            data-testid="new-password-input"
          />
        </FormField>

        <FormField
          label={t("settings.password.confirmLabel")}
          htmlFor="confirm-pwd"
          error={fieldErrors.confirm}
        >
          <PasswordInput
            id="confirm-pwd"
            autoComplete="new-password"
            value={fields.confirm}
            onChange={setField("confirm")}
            disabled={isPending}
            hasError={!!fieldErrors.confirm}
            data-testid="confirm-password-input"
          />
        </FormField>
      </div>

      <div className={styles.formActions}>
        {success && (
          <span
            className={styles.successMsg}
            data-testid="password-success-msg"
          >
            {t("settings.password.updated")}
          </span>
        )}
        {apiError && (
          <span className={styles.apiError} data-testid="password-api-error">
            {apiError}
          </span>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={isPending}
          data-testid="save-password-btn"
        >
          {isPending
            ? t("settings.password.saving")
            : t("settings.password.save")}
        </Button>
      </div>
    </section>
  );
}

// ── Danger zone (account deletion, Spec #127) ─────────────────────────────

function DangerZoneSection() {
  const { t } = useTranslation();
  const { confirm } = useConfirmDialog();
  const [isPending, setIsPending] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleDelete = () => {
    if (isPending) return;
    void confirm({
      title: t("settings.delete.confirmTitle"),
      message: t("settings.delete.confirmBody"),
      confirmLabel: t("settings.delete.confirmLabel"),
    }).then(async (ok) => {
      if (!ok) return;
      setIsPending(true);
      setApiError(null);
      try {
        const result = await authClient.deleteUser();
        if (result.error) {
          setApiError(result.error.message ?? t("settings.delete.error"));
          setIsPending(false);
          return;
        }
        // Deletion is immediate (no email confirmation sender configured) —
        // the fresh-session guard is satisfied by this signed-in request.
        window.location.href = "/login";
      } catch {
        setApiError(t("settings.delete.error"));
        setIsPending(false);
      }
    });
  };

  return (
    <section className={styles.section} data-testid="delete-account-section">
      <h2 className={styles.sectionTitle}>
        {t("settings.delete.sectionTitle")}
      </h2>
      <p className={styles.emptyState}>{t("settings.delete.description")}</p>
      {apiError && (
        <span className={styles.apiError} data-testid="delete-account-error">
          {apiError}
        </span>
      )}
      <div className={styles.formActions}>
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          data-testid="delete-account-btn"
        >
          {isPending
            ? t("settings.delete.deleting")
            : t("settings.delete.confirmLabel")}
        </Button>
      </div>
    </section>
  );
}

// ── Teams ──────────────────────────────────────────────────────────────────

function TeamsSection() {
  const { t } = useTranslation();
  const locale = useLocale();
  const teamsQuery = useQuery(userTeamsQueryOptions());

  const teamList = teamsQuery.data?.isOk ? teamsQuery.data.value : [];

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {t("settings.teams.sectionTitle")}
      </h2>

      {teamsQuery.isLoading ? null : teamList.length === 0 ? (
        <p className={styles.emptyState} data-testid="teams-empty-state">
          {t("settings.teams.empty")}
        </p>
      ) : (
        <div className={styles.teamList} data-testid="teams-list">
          {teamList.map((team) => (
            <div key={team.id} className={styles.teamRow}>
              {team.avatarUrl ? (
                <img
                  src={team.avatarUrl}
                  alt={team.name}
                  className={styles.teamAvatar}
                />
              ) : (
                <div className={styles.teamAvatarFallback}>
                  {team.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className={styles.teamName}>{team.name}</span>
              <span className={styles.roleBadge}>
                {teamRoleLabel(team.role, locale)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
