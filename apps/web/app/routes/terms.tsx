import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { useTranslation } from "~/features/i18n";
import styles from "./_legal.module.css";

export const Route = createFileRoute("/terms")({
  head: () => titleHead("Terms"),
  component: TermsPage,
});

function TermsPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.heading}>{t("legal.terms.title")}</h1>
        <p className={styles.draftNotice}>{t("legal.terms.draftNotice")}</p>
        <p className={styles.body}>{t("legal.terms.body")}</p>
      </div>
    </div>
  );
}
