import { DRAFT_COLOR_VALUES, type DraftColor } from "../title-page.schema";
import styles from "./TitlePageDraftPanel.module.css";

const COLOR_HEX: Record<DraftColor, string> = {
  white: "#ffffff",
  blue: "#a8c8ff",
  pink: "#ffc6dd",
  yellow: "#fff3a8",
  green: "#bfe8c0",
  goldenrod: "#dab14a",
  buff: "#f1e0c4",
  salmon: "#f5a89a",
  cherry: "#d04e5a",
  tan: "#c9a37a",
};

interface TitlePageDraftPanelProps {
  draftDate: string | null;
  draftColor: DraftColor | null;
  disabled?: boolean;
  onChangeDate: (date: string | null) => void;
  onChangeColor: (color: DraftColor | null) => void;
}

export function TitlePageDraftPanel({
  draftDate,
  draftColor,
  disabled = false,
  onChangeDate,
  onChangeColor,
}: TitlePageDraftPanelProps) {
  return (
    <aside className={styles.panel} data-testid="title-page-draft-panel">
      <h2 className={styles.heading}>Draft</h2>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="tp-draft-date">
          Date
        </label>
        <input
          id="tp-draft-date"
          type="date"
          className={styles.input}
          value={draftDate ?? ""}
          disabled={disabled}
          data-testid="tp-draft-date"
          onChange={(e) => onChangeDate(e.target.value || null)}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Color</span>
        <div className={styles.swatchRow} role="group" aria-label="Draft color">
          {DRAFT_COLOR_VALUES.map((color) => (
            <button
              key={color}
              type="button"
              className={styles.swatch}
              style={{ background: COLOR_HEX[color] }}
              aria-label={color}
              aria-pressed={draftColor === color}
              disabled={disabled}
              data-testid={`tp-draft-color-${color}`}
              onClick={() => onChangeColor(color)}
            />
          ))}
          <button
            type="button"
            className={`${styles.swatch} ${styles.swatchClear}`}
            aria-label="Clear color"
            aria-pressed={draftColor === null}
            disabled={disabled}
            data-testid="tp-draft-color-clear"
            onClick={() => onChangeColor(null)}
          >
            ×
          </button>
        </div>
      </div>
    </aside>
  );
}
