import { useRef, useState } from "react";
import { z } from "zod";
import { Button, useHydratedInput } from "@oh-writers/ui";
import { Formats, Genres, type TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import styles from "./ProjectForm.module.css";

type FormatValue = (typeof Formats)[keyof typeof Formats];
type GenreValue = (typeof Genres)[keyof typeof Genres];

type Translate = (key: TranslationKey) => string;

// Object.values loses literal types; cast back to preserve them for z.enum inference
const formatTuple = Object.values(Formats) as unknown as [
  FormatValue,
  ...FormatValue[],
];
const genreTuple = Object.values(Genres) as unknown as [
  GenreValue,
  ...GenreValue[],
];

const buildFormSchema = (t: Translate) =>
  z.object({
    title: z
      .string()
      .min(1, t("projects.form.titleRequired"))
      .max(200, t("projects.form.titleTooLong")),
    format: z.enum(formatTuple, {
      errorMap: () => ({ message: t("projects.form.formatRequired") }),
    }),
    genre: z.enum(genreTuple).optional(),
  });

const FORMAT_LABEL_KEYS: Record<string, TranslationKey> = {
  feature: "projects.format.feature",
  short: "projects.format.short",
  series_episode: "projects.format.seriesEpisode",
  pilot: "projects.format.pilot",
};

const GENRE_LABEL_KEYS: Record<string, TranslationKey> = {
  drama: "projects.genre.drama",
  comedy: "projects.genre.comedy",
  thriller: "projects.genre.thriller",
  horror: "projects.genre.horror",
  action: "projects.genre.action",
  "sci-fi": "projects.genre.sciFi",
  documentary: "projects.genre.documentary",
  other: "projects.genre.other",
};

type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

interface ProjectFormProps {
  initialValues?: Partial<FormValues>;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function ProjectForm({
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel,
}: ProjectFormProps) {
  const { t } = useTranslation();
  const resolvedSubmitLabel = submitLabel ?? t("projects.form.submit");
  const [values, setValues] = useState<Partial<FormValues>>({
    title: "",
    format: undefined,
    genre: undefined,
    ...initialValues,
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = buildFormSchema(t).safeParse(values);
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FormValues;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSubmit(result.data);
  };

  const setField = <K extends keyof FormValues>(
    key: K,
    value: FormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // Server-rendered + autofocused: adopt anything typed before React wired its
  // onChange, or the title sits in the field while state stays empty (#117).
  const titleRef = useRef<HTMLInputElement>(null);
  useHydratedInput(titleRef, values.title ?? "", (next) =>
    setField("title", next),
  );

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="title">
          {t("projects.form.titleLabel")}{" "}
          <span className={styles.required}>*</span>
        </label>
        <input
          ref={titleRef}
          id="title"
          type="text"
          className={`${styles.input} ${errors.title ? styles.error : ""}`}
          value={values.title ?? ""}
          onChange={(e) => setField("title", e.target.value)}
          placeholder={t("projects.form.titlePlaceholder")}
          autoFocus
        />
        {errors.title && (
          <span className={styles.fieldError}>{errors.title}</span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="format">
          {t("projects.form.formatLabel")}{" "}
          <span className={styles.required}>*</span>
        </label>
        <select
          id="format"
          className={`${styles.select} ${errors.format ? styles.error : ""}`}
          value={values.format ?? ""}
          onChange={(e) => setField("format", e.target.value as FormatValue)}
        >
          <option value="">{t("projects.form.formatPlaceholder")}</option>
          {Object.entries(Formats).map(([, val]) => {
            const labelKey = FORMAT_LABEL_KEYS[val];
            return (
              <option key={val} value={val}>
                {labelKey ? t(labelKey) : val.replace("_", " ")}
              </option>
            );
          })}
        </select>
        {errors.format && (
          <span className={styles.fieldError}>{errors.format}</span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="genre">
          {t("projects.form.genreLabel")}{" "}
          <span className={styles.optional}>
            {t("projects.form.genreOptional")}
          </span>
        </label>
        <select
          id="genre"
          className={styles.select}
          value={values.genre ?? ""}
          onChange={(e) =>
            setField("genre", (e.target.value as GenreValue) || undefined)
          }
        >
          <option value="">{t("projects.form.genrePlaceholder")}</option>
          {Object.entries(Genres).map(([, val]) => {
            const labelKey = GENRE_LABEL_KEYS[val];
            return (
              <option key={val} value={val}>
                {labelKey
                  ? t(labelKey)
                  : val.charAt(0).toUpperCase() + val.slice(1)}
              </option>
            );
          })}
        </select>
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? t("status.saving") : resolvedSubmitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("action.cancel")}
        </Button>
      </div>
    </form>
  );
}
