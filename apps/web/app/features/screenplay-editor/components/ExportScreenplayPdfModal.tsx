import { useMemo, useState } from "react";
import { Button, Dialog } from "@oh-writers/ui";
import { EXPORT_FORMAT_META, type ExportFormat } from "@oh-writers/domain";
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
    <Dialog
      isOpen
      onClose={onClose}
      title={`Esporta — ${meta.labelIt}`}
      showCloseButton
      data-testid="screenplay-export-modal"
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Annulla
          </Button>
          <Button
            variant="primary"
            data-testid="screenplay-export-generate"
            disabled={!canGenerate}
            onClick={handleGenerate}
          >
            {isPending ? "Generazione…" : "Genera"}
          </Button>
        </>
      }
    >
      <p className={styles.description}>{meta.descriptionIt}</p>

      {meta.requiresSceneSelection && (
        <div
          className={styles.scenes}
          data-testid="screenplay-export-scene-list"
        >
          <div className={styles.scenesHeader}>
            Scegli le scene ({selected.size} selezionate)
          </div>
          {scenesQuery.isLoading ? (
            <p className={styles.empty}>Caricamento scene…</p>
          ) : scenes.length === 0 ? (
            <p className={styles.empty}>Nessuna scena trovata.</p>
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
        <span>Includi cover page</span>
      </label>
    </Dialog>
  );
}
