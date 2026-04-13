import { useState } from "react";
import { z } from "zod";
import { Button } from "@oh-writers/ui";
import { Formats, Genres } from "@oh-writers/domain";
import styles from "./ProjectForm.module.css";

type FormatValue = (typeof Formats)[keyof typeof Formats];
type GenreValue = (typeof Genres)[keyof typeof Genres];

// Object.values loses literal types; cast back to preserve them for z.enum inference
const formatTuple = Object.values(Formats) as unknown as [
  FormatValue,
  ...FormatValue[],
];
const genreTuple = Object.values(Genres) as unknown as [
  GenreValue,
  ...GenreValue[],
];

const FormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title is too long"),
  format: z.enum(formatTuple, {
    errorMap: () => ({ message: "Format is required" }),
  }),
  genre: z.enum(genreTuple).optional(),
});

type FormValues = z.infer<typeof FormSchema>;
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
  submitLabel = "Create project",
}: ProjectFormProps) {
  const [values, setValues] = useState<Partial<FormValues>>({
    title: "",
    format: undefined,
    genre: undefined,
    ...initialValues,
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = FormSchema.safeParse(values);
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

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="title">
          Title <span className={styles.required}>*</span>
        </label>
        <input
          id="title"
          type="text"
          className={`${styles.input} ${errors.title ? styles.error : ""}`}
          value={values.title ?? ""}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="My Screenplay"
          autoFocus
        />
        {errors.title && (
          <span className={styles.fieldError}>{errors.title}</span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="format">
          Format <span className={styles.required}>*</span>
        </label>
        <select
          id="format"
          className={`${styles.select} ${errors.format ? styles.error : ""}`}
          value={values.format ?? ""}
          onChange={(e) => setField("format", e.target.value as FormatValue)}
        >
          <option value="">Select a format…</option>
          {Object.entries(Formats).map(([, val]) => (
            <option key={val} value={val}>
              {val.replace("_", " ")}
            </option>
          ))}
        </select>
        {errors.format && (
          <span className={styles.fieldError}>{errors.format}</span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="genre">
          Genre <span className={styles.optional}>(optional)</span>
        </label>
        <select
          id="genre"
          className={styles.select}
          value={values.genre ?? ""}
          onChange={(e) =>
            setField("genre", (e.target.value as GenreValue) || undefined)
          }
        >
          <option value="">Select a genre…</option>
          {Object.entries(Genres).map(([, val]) => (
            <option key={val} value={val}>
              {val.charAt(0).toUpperCase() + val.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
