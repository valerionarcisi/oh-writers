// IT is the default runtime language (Spec 04f). SIAE export is Italian-only
// by spec; English labels are not shipped — override via the `labels` prop.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { match } from "ts-pattern";
import { Button, Dialog, FormField, Input } from "@oh-writers/ui";
import { useExportSubjectSiae } from "../hooks/useExportSubjectSiae";
import { useSaveSiaeMetadata } from "../hooks/useSiaeMetadata";
import { SiaeExportInputSchema } from "../documents.schema";
import {
  buildSiaeInitialState,
  toSiaeExportInput,
  toSiaeMetadata,
  type SiaeFormDefaults,
  type SiaeFormState,
} from "../lib/siae-initial-state";
import { AuthorListField, type AuthorEntry } from "./AuthorListField";
import styles from "./ExportSiaeModal.module.css";

export interface ExportSiaeModalLabels {
  readonly heading: string;
  readonly titleLabel: string;
  readonly genreLabel: string;
  readonly durationLabel: string;
  readonly dateLabel: string;
  readonly notesLabel: string;
  readonly notesPlaceholder: string;
  readonly authorsHeading: string;
  readonly addAuthor: string;
  readonly removeAuthor: string;
  readonly fullNamePlaceholder: string;
  readonly taxCodePlaceholder: string;
  readonly submit: string;
  readonly submitting: string;
  readonly cancel: string;
  readonly genericError: string;
}

export interface ExportSiaeModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly projectId: string;
  readonly defaults: SiaeFormDefaults;
  readonly labels?: Partial<ExportSiaeModalLabels>;
}

const DEFAULT_LABELS: ExportSiaeModalLabels = {
  heading: "Esporta PDF per deposito SIAE",
  titleLabel: "Titolo",
  genreLabel: "Genere dichiarato",
  durationLabel: "Durata stimata (minuti)",
  dateLabel: "Data di compilazione",
  notesLabel: "Note di deposito (opzionale)",
  notesPlaceholder: "Note incluse nella copertina…",
  authorsHeading: "Autori",
  addAuthor: "+ Aggiungi autore",
  removeAuthor: "Rimuovi",
  fullNamePlaceholder: "Nome completo",
  taxCodePlaceholder: "Codice fiscale (opzionale)",
  submit: "Genera PDF",
  submitting: "Generazione…",
  cancel: "Annulla",
  genericError: "Qualcosa è andato storto. Riprova.",
};

type FieldErrors = {
  title?: string;
  declaredGenre?: string;
  estimatedDurationMinutes?: string;
  compilationDate?: string;
  depositNotes?: string;
  authors?: string;
  authorsAt?: Record<number, { fullName?: string; taxCode?: string }>;
};

const computeFieldErrors = (
  issues: ReadonlyArray<{
    path: ReadonlyArray<string | number>;
    message: string;
  }>,
): FieldErrors => {
  const errors: FieldErrors = { authorsAt: {} };
  for (const issue of issues) {
    const [head, ...rest] = issue.path;
    if (head === "authors" && rest.length === 0) {
      errors.authors = issue.message;
      continue;
    }
    if (head === "authors" && typeof rest[0] === "number") {
      const idx = rest[0];
      const sub = rest[1];
      const bucket = errors.authorsAt![idx] ?? {};
      if (sub === "fullName") bucket.fullName = issue.message;
      if (sub === "taxCode") bucket.taxCode = issue.message;
      errors.authorsAt![idx] = bucket;
      continue;
    }
    if (head === "title") errors.title = issue.message;
    if (head === "declaredGenre") errors.declaredGenre = issue.message;
    if (head === "estimatedDurationMinutes")
      errors.estimatedDurationMinutes = issue.message;
    if (head === "compilationDate") errors.compilationDate = issue.message;
    if (head === "depositNotes") errors.depositNotes = issue.message;
  }
  return errors;
};

export function ExportSiaeModal({
  isOpen,
  onClose,
  projectId,
  defaults,
  labels,
}: ExportSiaeModalProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const [state, setState] = useState<SiaeFormState>(() =>
    buildSiaeInitialState(defaults),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const exportMutation = useExportSubjectSiae();
  const saveMetadata = useSaveSiaeMetadata(projectId);

  // Reset the form whenever the modal opens so that reopening after a
  // cancellation does not leak stale state.
  useEffect(() => {
    if (!isOpen) return;
    setState(buildSiaeInitialState(defaults));
    setFieldErrors({});
    setSubmitError(null);
    const t = setTimeout(() => firstInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen, defaults]);

  const setAuthors = (authors: ReadonlyArray<AuthorEntry>) =>
    setState((prev) => ({ ...prev, authors }));

  const isPending = exportMutation.isPending;

  const isFormMinimallyValid = useMemo(() => {
    if (state.title.trim().length === 0) return false;
    if (state.compilationDate.length === 0) return false;
    if (
      !Number.isFinite(state.estimatedDurationMinutes) ||
      state.estimatedDurationMinutes < 1
    )
      return false;
    if (state.authors.length < 1) return false;
    if (state.authors.some((a) => a.fullName.trim().length === 0)) return false;
    return true;
  }, [state]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    const candidate = toSiaeExportInput(projectId, state);
    const parsed = SiaeExportInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setFieldErrors(computeFieldErrors(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    exportMutation.mutate(parsed.data, {
      onSuccess: () => {
        saveMetadata.mutate(toSiaeMetadata(state));
        onClose();
      },
      onError: (err) => {
        const tagged = err as unknown as { _tag?: string };
        const copy = match(tagged)
          .with(
            { _tag: "SubjectNotFoundError" },
            () =>
              "Soggetto non pronto: scrivi del contenuto prima di esportare.",
          )
          .with(
            { _tag: "ForbiddenError" },
            () => "Non hai i permessi per esportare questo progetto.",
          )
          .with(
            { _tag: "ValidationError" },
            () => "Il modulo SIAE contiene valori non validi.",
          )
          .with({ _tag: "DbError" }, () => l.genericError)
          .otherwise(() => l.genericError);
        setSubmitError(copy);
      },
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={l.heading}
      actions={
        <div className={styles.actions}>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            data-testid="siae-export-cancel"
          >
            {l.cancel}
          </Button>
          <Button
            type="submit"
            form="siae-export-form"
            variant="primary"
            disabled={isPending || !isFormMinimallyValid}
            data-testid="siae-export-submit"
          >
            {isPending ? l.submitting : l.submit}
          </Button>
        </div>
      }
    >
      <form
        id="siae-export-form"
        className={styles.form}
        onSubmit={handleSubmit}
        data-testid="siae-export-form"
      >
        <fieldset className={styles.section}>
          <legend className={styles.legend}>{l.heading}</legend>
          <FormField
            label={l.titleLabel}
            htmlFor="siae-title"
            error={fieldErrors.title ?? null}
          >
            <Input
              id="siae-title"
              ref={firstInputRef}
              type="text"
              value={state.title}
              hasError={!!fieldErrors.title}
              onChange={(e) => {
                const { value } = e.currentTarget;
                setState((p) => ({ ...p, title: value }));
              }}
              data-testid="siae-title-input"
            />
          </FormField>
          <div className={styles.row}>
            <FormField
              label={l.genreLabel}
              htmlFor="siae-genre"
              error={fieldErrors.declaredGenre ?? null}
            >
              <Input
                id="siae-genre"
                type="text"
                value={state.declaredGenre}
                hasError={!!fieldErrors.declaredGenre}
                onChange={(e) => {
                  const { value } = e.currentTarget;
                  setState((p) => ({ ...p, declaredGenre: value }));
                }}
                data-testid="siae-genre-input"
              />
            </FormField>
            <FormField
              label={l.durationLabel}
              htmlFor="siae-duration"
              error={fieldErrors.estimatedDurationMinutes ?? null}
            >
              <Input
                id="siae-duration"
                type="number"
                min={1}
                max={600}
                value={state.estimatedDurationMinutes}
                hasError={!!fieldErrors.estimatedDurationMinutes}
                onChange={(e) => {
                  const { value } = e.currentTarget;
                  setState((p) => ({
                    ...p,
                    estimatedDurationMinutes: Number(value),
                  }));
                }}
                data-testid="siae-duration-input"
              />
            </FormField>
            <FormField
              label={l.dateLabel}
              htmlFor="siae-date"
              error={fieldErrors.compilationDate ?? null}
            >
              <Input
                id="siae-date"
                type="date"
                value={state.compilationDate}
                hasError={!!fieldErrors.compilationDate}
                onChange={(e) => {
                  const { value } = e.currentTarget;
                  setState((p) => ({ ...p, compilationDate: value }));
                }}
                data-testid="siae-date-input"
              />
            </FormField>
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend className={styles.legend}>{l.authorsHeading}</legend>
          <AuthorListField
            authors={state.authors}
            onChange={setAuthors}
            minEntries={1}
            labels={{
              heading: l.authorsHeading,
              addAuthor: l.addAuthor,
              removeAuthor: l.removeAuthor,
              fullNamePlaceholder: l.fullNamePlaceholder,
              taxCodePlaceholder: l.taxCodePlaceholder,
            }}
            testId="siae-authors"
          />
          {fieldErrors.authors ? (
            <p className={styles.errorBanner}>{fieldErrors.authors}</p>
          ) : null}
        </fieldset>

        <fieldset className={styles.section}>
          <legend className={styles.legend}>{l.notesLabel}</legend>
          <FormField
            label={l.notesLabel}
            htmlFor="siae-notes"
            error={fieldErrors.depositNotes ?? null}
          >
            <textarea
              id="siae-notes"
              className={styles.textArea}
              value={state.depositNotes}
              placeholder={l.notesPlaceholder}
              onChange={(e) => {
                const { value } = e.currentTarget;
                setState((p) => ({ ...p, depositNotes: value }));
              }}
              data-testid="siae-notes-input"
            />
          </FormField>
        </fieldset>

        {submitError ? (
          <p className={styles.errorBanner} role="alert">
            {submitError}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
