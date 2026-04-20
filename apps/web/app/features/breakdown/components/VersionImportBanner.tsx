import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banner } from "@oh-writers/ui";
import { staleScenesOptions } from "../hooks/useBreakdown";

interface Props {
  projectId: string;
  versionId: string;
}

const dismissedKey = (versionId: string) =>
  `breakdown-banner-dismissed-${versionId}`;

export function VersionImportBanner({ versionId }: Props) {
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
      message={`${staleSceneIds.length} scena${staleSceneIds.length === 1 ? "" : "e"} contengono elementi che potrebbero non essere più presenti dopo l'import.`}
      onDismiss={handleDismiss}
    />
  );
}
