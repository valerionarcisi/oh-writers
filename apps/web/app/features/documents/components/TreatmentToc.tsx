import type { FC } from "react";
import {
  extractTreatmentHeadings,
  type TreatmentHeading,
} from "../lib/narrative-shell";
import { useTranslation } from "~/features/i18n";
import styles from "./TreatmentToc.module.css";

interface TreatmentTocProps {
  readonly content: string;
}

export const TreatmentToc: FC<TreatmentTocProps> = ({ content }) => {
  const { t } = useTranslation();
  const headings = extractTreatmentHeadings(content);

  return (
    <nav className={styles.toc} aria-label={t("documents.toc.ariaLabel")}>
      <p className={styles.label}>{t("documents.toc.label")}</p>
      {headings.length === 0 ? (
        <p className={styles.empty}>{t("documents.toc.empty")}</p>
      ) : (
        <ul className={styles.list}>
          {headings.map((h, idx) => (
            <li
              key={h.id}
              className={styles.row}
              data-level={h.level}
              data-testid={`treatment-toc-${idx}`}
            >
              {renderRow(h)}
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
};

const renderRow = (h: TreatmentHeading) => {
  if (h.level === 2) {
    return (
      <>
        <span className={styles.num}>·</span>
        <span className={styles.text}>{h.text}</span>
      </>
    );
  }
  return <span className={styles.textSub}>{h.text}</span>;
};
