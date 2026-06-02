import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banner } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import { staleScenesOptions } from "../hooks/useBreakdown";

interface Props {
  projectId: string;
  versionId: string;
}

const dismissedKey = (versionId: string) =>
  `breakdown-banner-dismissed-${versionId}`;

export function VersionImportBanner({ versionId }: Props) {
  const { t } = useTranslation();
  const { data: staleSceneIds = [] } = useQuery(staleScenesOptions(versionId));
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !versionId) return;
    setDismissed(window.localStorage.getItem(dismissedKey(versionId)) === "1");
  }, [versionId]);

  if (dismissed || staleSceneIds.length === 0 || !versionId) return null;

  const handleDismiss = () => {
    window.localStorage.setItem(dismissedKey(versionId), "1");
    setDismissed(true);
  };

  return (
    <Banner
      variant="warning"
      data-testid="version-import-banner"
      message={`${staleSceneIds.length}${
        staleSceneIds.length === 1
          ? t("breakdown.importBanner.sceneSingularSuffix")
          : t("breakdown.importBanner.scenePluralSuffix")
      }`}
      onDismiss={handleDismiss}
      dismissLabel={t("shell.banner.dismiss")}
    />
  );
}
