import { Banner } from "@oh-writers/ui";

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
  return (
    <Banner
      variant="cesare"
      message={`Cesare ha trovato ${pendingCount} elemento${pendingCount === 1 ? "" : "i"} da confermare`}
      data-testid="cesare-suggestion-banner"
      actions={[
        {
          label: "Accetta tutti",
          variant: "primary",
          onClick: onAcceptAll,
        },
        {
          label: "Ignora tutti",
          onClick: onIgnoreAll,
        },
      ]}
      onDismiss={onDismiss}
    />
  );
}
