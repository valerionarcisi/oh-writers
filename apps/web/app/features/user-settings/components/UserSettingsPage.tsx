import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@oh-writers/ui";
import { unwrapResult } from "@oh-writers/utils";
import { authClient } from "~/lib/auth-client";
import {
  updateUserProfile,
  userProfileQueryOptions,
  userAccountProvidersQueryOptions,
  userTeamsQueryOptions,
} from "../server/user-settings.server";
import styles from "./UserSettingsPage.module.css";

interface UserSettingsPageProps {
  userName: string;
  userEmail: string;
}

export function UserSettingsPage({ userName, userEmail }: UserSettingsPageProps) {
  const profileQuery = useQuery(userProfileQueryOptions());
  const profile = profileQuery.data?.isOk ? profileQuery.data.value : null;

  const name = profile?.name ?? userName;
  const email = profile?.email ?? userEmail;
  const avatarUrl = profile?.avatarUrl ?? null;

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.title}>Impostazioni account</h1>
        <p className={styles.subtitle}>{email}</p>
      </div>

      <ProfileSection
        initialName={name}
        email={email}
        initialAvatarUrl={avatarUrl}
      />

      <PasswordSection />

      <TeamsSection />
    </div>
  );
}

// ── Profile ────────────────────────────────────────────────────────────────

const ProfileSchema = z.object({
  name: z.string().min(1, "Il nome è obbligatorio").max(100, "Massimo 100 caratteri"),
  avatarUrl: z
    .string()
    .url("URL non valido")
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

function ProfileSection({
  initialName,
  email,
  initialAvatarUrl,
}: {
  initialName: string;
  email: string;
  initialAvatarUrl: string | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; avatarUrl?: string }>({});
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const previewUrl = avatarUrl.trim() || null;

  const mut = useMutation({
    mutationFn: async () => {
      const parsed = ProfileSchema.safeParse({ name, avatarUrl: avatarUrl || null });
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
        await updateUserProfile({ data: { name: parsed.data.name, avatarUrl: parsed.data.avatarUrl } }),
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
        setApiError((e as Error).message ?? "Errore durante il salvataggio.");
      }
    },
  });

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Profilo</h2>

      <div className={styles.avatarRow}>
        {previewUrl ? (
          <img src={previewUrl} alt="Avatar" className={styles.avatarPreview} />
        ) : (
          <div className={styles.avatarFallback}>{name.charAt(0).toUpperCase()}</div>
        )}
        <div className={styles.field} style={{ flex: 1 }}>
          <label className={styles.label} htmlFor="avatar-url">
            URL avatar
          </label>
          <input
            id="avatar-url"
            className={styles.input}
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            disabled={mut.isPending}
          />
          {fieldErrors.avatarUrl && (
            <span className={styles.fieldError}>{fieldErrors.avatarUrl}</span>
          )}
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="profile-name">
            Nome
          </label>
          <input
            id="profile-name"
            className={styles.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={mut.isPending}
            data-testid="profile-name-input"
          />
          {fieldErrors.name && <span className={styles.fieldError}>{fieldErrors.name}</span>}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>Email</span>
          <span className={styles.readOnly}>{email}</span>
        </div>
      </div>

      <div className={styles.formActions}>
        {success && <span className={styles.successMsg}>Salvato!</span>}
        {apiError && <span className={styles.apiError}>{apiError}</span>}
        <Button
          variant="primary"
          size="sm"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          data-testid="save-profile-btn"
        >
          {mut.isPending ? "Salvataggio…" : "Salva profilo"}
        </Button>
      </div>
    </section>
  );
}

// ── Password ───────────────────────────────────────────────────────────────

const PasswordSchema = z
  .object({
    current: z.string().min(1, "Inserisci la password attuale"),
    next: z.string().min(8, "La nuova password deve avere almeno 8 caratteri"),
    confirm: z.string().min(1, "Conferma la nuova password"),
  })
  .refine((d) => d.next === d.confirm, {
    message: "Le password non corrispondono",
    path: ["confirm"],
  });

function PasswordSection() {
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

  const setField = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async () => {
    const parsed = PasswordSchema.safeParse(fields);
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
        setApiError(result.error.message ?? "Errore durante il cambio password.");
      } else {
        setSuccess(true);
        setFields({ current: "", next: "", confirm: "" });
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setApiError("Errore durante il cambio password.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Cambia password</h2>

      <div className={styles.fieldGroup}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="current-pwd">
            Password attuale
          </label>
          <input
            id="current-pwd"
            className={styles.input}
            type="password"
            value={fields.current}
            onChange={setField("current")}
            disabled={isPending}
            data-testid="current-password-input"
          />
          {fieldErrors.current && <span className={styles.fieldError}>{fieldErrors.current}</span>}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-pwd">
            Nuova password
          </label>
          <input
            id="new-pwd"
            className={styles.input}
            type="password"
            value={fields.next}
            onChange={setField("next")}
            disabled={isPending}
            data-testid="new-password-input"
          />
          {fieldErrors.next && <span className={styles.fieldError}>{fieldErrors.next}</span>}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="confirm-pwd">
            Conferma nuova password
          </label>
          <input
            id="confirm-pwd"
            className={styles.input}
            type="password"
            value={fields.confirm}
            onChange={setField("confirm")}
            disabled={isPending}
            data-testid="confirm-password-input"
          />
          {fieldErrors.confirm && (
            <span className={styles.fieldError}>{fieldErrors.confirm}</span>
          )}
        </div>
      </div>

      <div className={styles.formActions}>
        {success && <span className={styles.successMsg}>Password aggiornata!</span>}
        {apiError && <span className={styles.apiError}>{apiError}</span>}
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={isPending}
          data-testid="save-password-btn"
        >
          {isPending ? "Salvataggio…" : "Aggiorna password"}
        </Button>
      </div>
    </section>
  );
}

// ── Teams ──────────────────────────────────────────────────────────────────

function TeamsSection() {
  const teamsQuery = useQuery(userTeamsQueryOptions());

  const teamList =
    teamsQuery.data?.isOk ? teamsQuery.data.value : [];

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Team</h2>

      {teamsQuery.isLoading ? null : teamList.length === 0 ? (
        <p className={styles.emptyState}>Non fai parte di nessun team.</p>
      ) : (
        <div className={styles.teamList} data-testid="teams-list">
          {teamList.map((team) => (
            <div key={team.id} className={styles.teamRow}>
              {team.avatarUrl ? (
                <img src={team.avatarUrl} alt={team.name} className={styles.teamAvatar} />
              ) : (
                <div className={styles.teamAvatarFallback}>
                  {team.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className={styles.teamName}>{team.name}</span>
              <span className={styles.roleBadge}>{team.role}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
