// apps/web/app/features/documents/components/AiOffBanner.tsx
//
// Spec 84 §5 — when Features.AI_ENABLED is off, this is the ONLY trace of AI
// left in the product: one dismissible strip offering to turn Cesare back on.
// Every other AI surface (drawer, dock, margin notes, breakdown CTA, …) is
// hidden outright — see the gating sites listed in the spec. Rendered once
// per page above the document, mirroring where `CesareUpdatedBanner` sits.
import { useRef } from "react";
import { useButton } from "react-aria";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import { SETTINGS_ROUTE_PATH as AI_SETTINGS_ROUTE } from "~/features/ai-providers/openrouter-routes.const";
import { useAiOffBannerDismissed } from "./use-ai-off-banner-dismissed";
import styles from "./AiOffBanner.module.css";

export interface AiOffBannerProps {
  /** Current user id — scopes the dismissal to this user (localStorage key). */
  readonly userId: string;
}

function DismissButton({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(
    { onPress, "aria-label": label, type: "button" },
    ref,
  );
  return (
    <button
      {...buttonProps}
      ref={ref}
      className={styles.dismiss}
      title={label}
      data-testid="ai-off-banner-dismiss"
    >
      ×
    </button>
  );
}

export function AiOffBanner({ userId }: AiOffBannerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isDismissed, dismiss] = useAiOffBannerDismissed(userId);

  if (isDismissed) return null;

  return (
    <section
      className={styles.banner}
      role="status"
      data-testid="ai-off-banner"
    >
      <span className={styles.glyph} aria-hidden="true">
        ✦
      </span>
      <div className={styles.copy}>
        <span className={styles.title}>{t("documents.aiOffBanner.title")}</span>
        <span className={styles.message}>
          {t("documents.aiOffBanner.message")}
        </span>
      </div>
      <Button
        variant="primary"
        size="sm"
        className={styles.cta}
        onPress={() => void router.navigate({ to: AI_SETTINGS_ROUTE })}
        data-testid="ai-off-banner-cta"
      >
        {t("documents.aiOffBanner.cta")}
      </Button>
      <DismissButton
        onPress={dismiss}
        label={t("documents.aiOffBanner.dismiss")}
      />
    </section>
  );
}
