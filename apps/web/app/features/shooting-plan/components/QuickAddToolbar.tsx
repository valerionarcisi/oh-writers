import { useState } from "react";
import type { PatternId, ShotSize } from "@oh-writers/domain";
import { PatternMenu } from "./PatternMenu";
import styles from "./QuickAddToolbar.module.css";

interface QuickAddToolbarProps {
  recommendedPatternId: PatternId | null;
  onAddShot: (size: ShotSize) => void;
  onApplyPattern: (id: PatternId) => void;
  disabled?: boolean;
}

const SHOT_BUTTONS: { size: ShotSize; tooltip: string; tone: string }[] = [
  { size: "WS", tooltip: "Wide Shot — figura intera con ambiente", tone: "green" },
  { size: "EWS", tooltip: "Extreme Wide Shot — soggetto piccolo, ambiente dominante", tone: "green" },
  { size: "MS", tooltip: "Medium Shot — dalla vita in su", tone: "blue" },
  { size: "OTS", tooltip: "Over The Shoulder — da dietro le spalle di un personaggio", tone: "blue" },
  { size: "CU", tooltip: "Close-Up — primo piano (volto)", tone: "red" },
  { size: "ECU", tooltip: "Extreme Close-Up — dettaglio (occhi, labbra)", tone: "red" },
  { size: "INSERT", tooltip: "Insert — dettaglio di un oggetto o azione", tone: "orange" },
];

export function QuickAddToolbar({
  recommendedPatternId,
  onAddShot,
  onApplyPattern,
  disabled,
}: QuickAddToolbarProps) {
  const [patternOpen, setPatternOpen] = useState(false);

  return (
    <div className={styles.root} role="toolbar" aria-label="Quick-add shot">
      <span className={styles.label}>+ shot:</span>
      {SHOT_BUTTONS.map((b) => (
        <button
          key={b.size}
          type="button"
          className={styles.shotBtn}
          data-tone={b.tone}
          title={b.tooltip}
          disabled={disabled}
          onClick={() => onAddShot(b.size)}
        >
          {b.size}
        </button>
      ))}

      <div className={styles.divider} aria-hidden="true" />

      <div className={styles.patternWrap}>
        <button
          type="button"
          className={styles.patternBtn}
          title="Aggiunge una copertura completa (es. campo/controcampo)"
          disabled={disabled}
          onClick={() => setPatternOpen((o) => !o)}
        >
          ▼ Pattern…
        </button>
        {patternOpen && (
          <PatternMenu
            recommendedId={recommendedPatternId}
            onSelect={onApplyPattern}
            onClose={() => setPatternOpen(false)}
          />
        )}
      </div>

      <div className={styles.spacer} />
      <span className={styles.hint}>⌘D duplica · ⌫ elimina</span>
    </div>
  );
}
