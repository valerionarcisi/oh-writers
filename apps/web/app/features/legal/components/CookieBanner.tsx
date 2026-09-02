// Spec 88 — cookie notice. The only cookie in use is the session/auth
// cookie (strictly necessary), so this is a notice with a single dismiss
// button, not an accept/reject consent gate.
import { Banner } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import { useCookieBannerDismissed } from "./use-cookie-banner-dismissed";
import styles from "./CookieBanner.module.css";

export function CookieBanner() {
  const { t } = useTranslation();
  const [isDismissed, dismiss] = useCookieBannerDismissed();

  if (isDismissed) return null;

  return (
    <div className={styles.wrapper}>
      <Banner
        variant="info"
        message={t("cookieBanner.message")}
        actions={[
          {
            label: t("cookieBanner.dismiss"),
            onClick: dismiss,
            variant: "primary",
          },
        ]}
        data-testid="cookie-banner"
      />
    </div>
  );
}
