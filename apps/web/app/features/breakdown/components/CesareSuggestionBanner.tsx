import { Banner } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";

interface Props {
  pendingCount: number;
  onAcceptAll: () => void;
  onIgnoreAll: () => void;
  onDismiss?: () => void;
}

export function CesareSuggestionBanner({
  pendingCount,
  onAcceptAll,
  onIgnoreAll,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const message = `${t("breakdown.suggestion.foundPrefix")}${pendingCount}${
    pendingCount === 1
      ? t("breakdown.suggestion.foundSingularSuffix")
      : t("breakdown.suggestion.foundPluralSuffix")
  }`;
  return (
    <Banner
      variant="cesare"
      message={message}
      data-testid="cesare-suggestion-banner"
      actions={[
        {
          label: t("breakdown.suggestion.acceptAll"),
          variant: "primary",
          onClick: onAcceptAll,
        },
        {
          label: t("breakdown.suggestion.ignoreAll"),
          onClick: onIgnoreAll,
        },
      ]}
      onDismiss={onDismiss}
      dismissLabel={t("shell.banner.dismiss")}
    />
  );
}
