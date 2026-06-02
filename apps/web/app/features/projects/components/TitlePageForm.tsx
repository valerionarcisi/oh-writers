import { useEffect, useState } from "react";
import { Button } from "@oh-writers/ui";
import {
  DraftColors,
  DRAFT_COLOR_VALUES,
  type TitlePage,
  type DraftColor,
} from "../title-page.schema";
import { useTranslation } from "~/features/i18n";
import styles from "./TitlePageForm.module.css";

interface TitlePageFormProps {
  projectTitle: string;
  initialValues: TitlePage;
  canEdit: boolean;
  isSubmitting?: boolean;
  onSubmit: (values: TitlePage) => void;
}

const toInputValue = (value: string | null): string => value ?? "";

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const COLOR_LABELS: Record<DraftColor, string> = {
  white: "White",
  blue: "Blue",
  pink: "Pink",
  yellow: "Yellow",
  green: "Green",
  goldenrod: "Goldenrod",
  buff: "Buff",
  salmon: "Salmon",
  cherry: "Cherry",
  tan: "Tan",
};

export function TitlePageForm({
  projectTitle,
  initialValues,
  canEdit,
  isSubmitting = false,
  onSubmit,
}: TitlePageFormProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<TitlePage>(initialValues);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setValues(initialValues);
    setIsDirty(false);
  }, [initialValues]);

  const update = <K extends keyof TitlePage>(key: K, value: TitlePage[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !isDirty) return;
    onSubmit(values);
  };

  return (
    <div className={styles.wrapper}>
      <form
        className={styles.form}
        onSubmit={handleSubmit}
        aria-label={t("projects.titlePage.formLabel")}
      >
        <fieldset className={styles.fieldset} disabled={!canEdit}>
          <div className={styles.row}>
            <label className={styles.label}>
              <span className={styles.labelText}>
                {t("projects.titlePage.titleLabel")}
              </span>
              <input
                className={styles.input}
                value={projectTitle}
                readOnly
                data-testid="title-page-title"
              />
              <span className={styles.hint}>
                {t("projects.titlePage.titleHint")}
              </span>
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.label}>
              <span className={styles.labelText}>
                {t("projects.titlePage.writtenBy")}
              </span>
              <input
                className={styles.input}
                value={toInputValue(values.author)}
                onChange={(e) => update("author", toNullable(e.target.value))}
                maxLength={200}
                data-testid="title-page-author"
              />
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.label}>
              <span className={styles.labelText}>
                {t("projects.titlePage.basedOn")}
              </span>
              <input
                className={styles.input}
                value={toInputValue(values.basedOn)}
                onChange={(e) => update("basedOn", toNullable(e.target.value))}
                maxLength={500}
                data-testid="title-page-based-on"
              />
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.label}>
              <span className={styles.labelText}>
                {t("projects.titlePage.contact")}
              </span>
              <textarea
                className={styles.textarea}
                value={toInputValue(values.contact)}
                onChange={(e) => update("contact", toNullable(e.target.value))}
                maxLength={1000}
                rows={4}
                data-testid="title-page-contact"
              />
            </label>
          </div>

          <div className={styles.rowGrid}>
            <label className={styles.label}>
              <span className={styles.labelText}>
                {t("projects.titlePage.draftDate")}
              </span>
              <input
                type="date"
                className={styles.input}
                value={toInputValue(values.draftDate)}
                onChange={(e) =>
                  update(
                    "draftDate",
                    e.target.value.length === 0 ? null : e.target.value,
                  )
                }
                data-testid="title-page-draft-date"
              />
            </label>

            <label className={styles.label}>
              <span className={styles.labelText}>
                {t("projects.titlePage.draftColor")}
              </span>
              <select
                className={styles.input}
                value={values.draftColor ?? ""}
                onChange={(e) =>
                  update(
                    "draftColor",
                    e.target.value.length === 0
                      ? null
                      : (e.target.value as DraftColor),
                  )
                }
                data-testid="title-page-draft-color"
              >
                <option value="">—</option>
                {DRAFT_COLOR_VALUES.map((color) => (
                  <option key={color} value={color}>
                    {COLOR_LABELS[color]}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.label}>
              <span className={styles.labelText}>
                {t("projects.titlePage.notes")}
              </span>
              <input
                className={styles.input}
                value={toInputValue(values.notes)}
                onChange={(e) => update("notes", toNullable(e.target.value))}
                maxLength={200}
                placeholder={t("projects.titlePage.notesPlaceholder")}
                data-testid="title-page-notes"
              />
            </label>
          </div>

          <div className={styles.row}>
            <label className={styles.label}>
              <span className={styles.labelText}>
                {t("projects.titlePage.wgaRegistration")}
              </span>
              <input
                className={styles.input}
                value={toInputValue(values.wgaRegistration)}
                onChange={(e) =>
                  update("wgaRegistration", toNullable(e.target.value))
                }
                maxLength={50}
                data-testid="title-page-wga"
              />
            </label>
          </div>

          {canEdit && (
            <div className={styles.actions}>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!isDirty || isSubmitting}
                data-testid="title-page-save"
              >
                {isSubmitting ? t("status.saving") : t("action.save")}
              </Button>
            </div>
          )}
        </fieldset>
      </form>

      <TitlePagePreview projectTitle={projectTitle} titlePage={values} />
    </div>
  );
}

interface TitlePagePreviewProps {
  projectTitle: string;
  titlePage: TitlePage;
}

function TitlePagePreview({ projectTitle, titlePage }: TitlePagePreviewProps) {
  const { t } = useTranslation();
  const {
    author,
    basedOn,
    contact,
    draftDate,
    draftColor,
    wgaRegistration,
    notes,
  } = titlePage;

  const hasDraftInfo = draftDate || draftColor || notes || wgaRegistration;

  return (
    <aside
      className={styles.preview}
      aria-label={t("projects.titlePage.previewLabel")}
    >
      <div className={styles.page} data-testid="title-page-preview">
        <div className={styles.pageCenter}>
          <h2 className={styles.pageTitle}>{projectTitle.toUpperCase()}</h2>
          {author && (
            <>
              <p className={styles.pageLabel}>
                {t("projects.titlePage.writtenBy")}
              </p>
              <p className={styles.pageAuthor}>{author}</p>
            </>
          )}
          {basedOn && <p className={styles.pageBasedOn}>{basedOn}</p>}
        </div>
        <div className={styles.pageFooter}>
          {hasDraftInfo && (
            <div
              className={styles.draftBlock}
              data-testid="preview-draft-block"
            >
              {notes && <div>{notes}</div>}
              {(draftDate || draftColor) && (
                <div>
                  {draftDate}
                  {draftDate && draftColor ? " · " : ""}
                  {draftColor ? COLOR_LABELS[draftColor] : ""}
                </div>
              )}
              {wgaRegistration && <div>WGA #{wgaRegistration}</div>}
            </div>
          )}
          {contact && <pre className={styles.contactBlock}>{contact}</pre>}
        </div>
      </div>
    </aside>
  );
}
