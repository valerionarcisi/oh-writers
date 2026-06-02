import { useMemo, useState } from "react";
import { DsButton, Modal, Skeleton } from "@oh-writers/ui";
import { EXPORT_FORMAT_META, type ExportFormat } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import { useListScreenplayScenes } from "../hooks/useListScreenplayScenes";
import styles from "./ExportScreenplayPdfModal.module.css";

interface ExportScreenplayPdfModalProps {
  isPending: boolean;
  format: ExportFormat;
  screenplayId: string;
  onClose: () => void;
  onGenerate: (opts: {
    includeCoverPage: boolean;
    sceneNumbers?: string[];
  }) => void;
}

export function ExportScreenplayPdfModal({
  isPending,
  format,
  screenplayId,
  onClose,
  onGenerate,
}: ExportScreenplayPdfModalProps) {
  const { t } = useTranslation();
  const meta = EXPORT_FORMAT_META[format];
  const [includeCoverPage, setIncludeCoverPage] = useState(
    meta.defaultIncludeCoverPage,
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const scenesQuery = useListScreenplayScenes(screenplayId, {
    enabled: meta.requiresSceneSelection,
  });
  const scenes = scenesQuery.data?.scenes ?? [];

  const canGenerate = useMemo(() => {
    if (isPending) return false;
    if (meta.requiresSceneSelection && selected.size === 0) return false;
    return true;
  }, [isPending, meta.requiresSceneSelection, selected.size]);

  const toggle = (n: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const handleGenerate = () => {
    onGenerate({
      includeCoverPage,
      sceneNumbers: meta.requiresSceneSelection
        ? Array.from(selected)
        : undefined,
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${t("screenplay.export.titlePrefix")}${meta.labelIt}`}
      size={meta.requiresSceneSelection ? "lg" : "md"}
      footer={
        <>
          <DsButton variant="ghost" onClick={onClose} disabled={isPending}>
            {t("screenplay.export.cancel")}
          </DsButton>
          <DsButton
            variant="primary"
            data-testid="screenplay-export-generate"
            disabled={!canGenerate}
            onClick={handleGenerate}
          >
            {isPending
              ? t("screenplay.export.generating")
              : t("screenplay.export.generate")}
          </DsButton>
        </>
      }
    >
      <div data-testid="screenplay-export-modal">
        <p className={styles.description}>{meta.descriptionIt}</p>

        {meta.requiresSceneSelection && (
          <div
            className={styles.scenes}
            data-testid="screenplay-export-scene-list"
          >
            <div className={styles.scenesHeader}>
              {t("screenplay.export.chooseScenesPrefix")}
              {selected.size}
              {t("screenplay.export.chooseScenesSuffix")}
            </div>
            {scenesQuery.isLoading ? (
              <div className={styles.empty}>
                <Skeleton
                  lines={5}
                  widths={["100%", "100%", "100%", "100%", "60%"]}
                  ariaLabel={t("screenplay.export.loadingScenes")}
                />
              </div>
            ) : scenes.length === 0 ? (
              <p className={styles.empty}>
                {t("screenplay.export.noSceneFound")}
              </p>
            ) : (
              <ul className={styles.sceneGrid}>
                {scenes.map((s) => {
                  const isChecked = selected.has(s.number);
                  return (
                    <li key={`${s.number}-${s.lineIndex}`}>
                      <label className={styles.sceneRow}>
                        <input
                          type="checkbox"
                          data-testid={`screenplay-export-scene-${s.number}`}
                          checked={isChecked}
                          onChange={() => toggle(s.number)}
                        />
                        <span className={styles.sceneNumber}>{s.number}.</span>
                        <span className={styles.sceneHeading}>{s.heading}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            data-testid="screenplay-export-include-cover-page"
            checked={includeCoverPage}
            onChange={(e) => setIncludeCoverPage(e.target.checked)}
          />
          <span>{t("screenplay.export.includeCoverPage")}</span>
        </label>
      </div>
    </Modal>
  );
}
