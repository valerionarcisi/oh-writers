// TODO: i18n — labels default to English; callers override for IT-facing flows.
// TODO: promote to packages/ui once a second caller emerges.
import { Button, Input } from "@oh-writers/ui";
import styles from "./AuthorListField.module.css";

export interface AuthorEntry {
  readonly id: string;
  readonly fullName: string;
  readonly taxCode: string | null;
}

export interface AuthorListFieldLabels {
  readonly heading: string;
  readonly addAuthor: string;
  readonly removeAuthor: string;
  readonly fullNamePlaceholder: string;
  readonly taxCodePlaceholder: string;
}

export interface AuthorListFieldProps {
  readonly authors: ReadonlyArray<AuthorEntry>;
  readonly onChange: (next: ReadonlyArray<AuthorEntry>) => void;
  readonly minEntries?: number;
  readonly labels?: Partial<AuthorListFieldLabels>;
  readonly testId?: string;
}

const DEFAULT_LABELS: AuthorListFieldLabels = {
  heading: "Authors",
  addAuthor: "+ Add author",
  removeAuthor: "Remove",
  fullNamePlaceholder: "Full name",
  taxCodePlaceholder: "Tax code (optional)",
};

const newAuthor = (): AuthorEntry => ({
  id: crypto.randomUUID(),
  fullName: "",
  taxCode: null,
});

export function AuthorListField({
  authors,
  onChange,
  minEntries = 1,
  labels,
  testId,
}: AuthorListFieldProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const canRemove = authors.length > minEntries;

  const updateAt = (index: number, patch: Partial<AuthorEntry>) => {
    onChange(authors.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const removeAt = (index: number) => {
    if (!canRemove) return;
    onChange(authors.filter((_, i) => i !== index));
  };

  const addOne = () => {
    onChange([...authors, newAuthor()]);
  };

  return (
    <div className={styles.wrapper} data-testid={testId}>
      <p className={styles.heading}>{l.heading}</p>
      <div className={styles.list}>
        {authors.map((author, index) => (
          <div className={styles.row} key={author.id}>
            <Input
              type="text"
              value={author.fullName}
              placeholder={l.fullNamePlaceholder}
              aria-label={`${l.fullNamePlaceholder} ${index + 1}`}
              onChange={(e) =>
                updateAt(index, { fullName: e.currentTarget.value })
              }
              data-testid={testId ? `${testId}-fullName-${index}` : undefined}
            />
            <Input
              type="text"
              value={author.taxCode ?? ""}
              placeholder={l.taxCodePlaceholder}
              aria-label={`${l.taxCodePlaceholder} ${index + 1}`}
              onChange={(e) => {
                const raw = e.currentTarget.value;
                updateAt(index, { taxCode: raw.length > 0 ? raw : null });
              }}
              data-testid={testId ? `${testId}-taxCode-${index}` : undefined}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.removeBtn}
              disabled={!canRemove}
              onClick={() => removeAt(index)}
              data-testid={testId ? `${testId}-remove-${index}` : undefined}
            >
              {l.removeAuthor}
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={styles.addBtn}
        onClick={addOne}
        data-testid={testId ? `${testId}-add` : undefined}
      >
        {l.addAuthor}
      </Button>
    </div>
  );
}
