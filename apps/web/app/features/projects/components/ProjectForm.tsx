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
  title: z.string().min(1, "Il titolo è obbligatorio").max(200, "Il titolo è troppo lungo"),
  format: z.enum(formatTuple, {
    errorMap: () => ({ message: "Il formato è obbligatorio" }),
  }),
  genre: z.enum(genreTuple).optional(),
});

const FORMAT_LABELS: Record<string, string> = {
  feature: "lungometraggio",
  short: "cortometraggio",
  series_episode: "episodio serie",
  pilot: "pilota",
};

const GENRE_LABELS: Record<string, string> = {
  drama: "Dramma",
  comedy: "Commedia",
  thriller: "Thriller",
  horror: "Horror",
  action: "Azione",
  "sci-fi": "Sci-fi",
  documentary: "Documentario",
  other: "Altro",
};

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
  submitLabel = "Crea progetto",
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
          Titolo <span className={styles.required}>*</span>
        </label>
        <input
          id="title"
          type="text"
          className={`${styles.input} ${errors.title ? styles.error : ""}`}
          value={values.title ?? ""}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="La mia sceneggiatura"
          autoFocus
        />
        {errors.title && (
          <span className={styles.fieldError}>{errors.title}</span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="format">
          Formato <span className={styles.required}>*</span>
        </label>
        <select
          id="format"
          className={`${styles.select} ${errors.format ? styles.error : ""}`}
          value={values.format ?? ""}
          onChange={(e) => setField("format", e.target.value as FormatValue)}
        >
          <option value="">Seleziona un formato…</option>
          {Object.entries(Formats).map(([, val]) => (
            <option key={val} value={val}>
              {FORMAT_LABELS[val] ?? val.replace("_", " ")}
            </option>
          ))}
        </select>
        {errors.format && (
          <span className={styles.fieldError}>{errors.format}</span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="genre">
          Genere <span className={styles.optional}>(opzionale)</span>
        </label>
        <select
          id="genre"
          className={styles.select}
          value={values.genre ?? ""}
          onChange={(e) =>
            setField("genre", (e.target.value as GenreValue) || undefined)
          }
        >
          <option value="">Seleziona un genere…</option>
          {Object.entries(Genres).map(([, val]) => (
            <option key={val} value={val}>
              {GENRE_LABELS[val] ?? val.charAt(0).toUpperCase() + val.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? "Salvataggio…" : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
