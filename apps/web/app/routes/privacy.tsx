import { createFileRoute } from "@tanstack/react-router";
import { titleHead } from "~/lib/document-title";
import { useTranslation } from "~/features/i18n";
import styles from "./_legal.module.css";

export const Route = createFileRoute("/privacy")({
  head: () => titleHead("Privacy"),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.heading}>{t("legal.privacy.title")}</h1>
        <p className={styles.draftNotice}>{t("legal.privacy.draftNotice")}</p>
        <p className={styles.body}>{t("legal.privacy.body")}</p>
      </div>
    </div>
  );
}
