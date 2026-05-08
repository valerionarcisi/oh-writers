import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import styles from "./EditableCell.module.css";

interface BaseProps<T extends string | number> {
  value: T;
  onCommit: (next: T) => void;
  disabled?: boolean;
  "data-testid"?: string;
  renderDisplay?: (value: T) => ReactNode;
}

interface TextCellProps extends BaseProps<string> {
  type: "text";
  maxLength?: number;
}

interface NumberCellProps extends BaseProps<number> {
  type: "number";
  min?: number;
  max?: number;
}

interface SelectCellProps extends BaseProps<string> {
  type: "select";
  options: ReadonlyArray<{ value: string; label: string }>;
}

export type EditableCellProps =
  | TextCellProps
  | NumberCellProps
  | SelectCellProps;

export function EditableCell(props: EditableCellProps) {
  const {
    value,
    onCommit,
    disabled,
    renderDisplay,
    "data-testid": testId,
  } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      (inputRef.current as HTMLElement | null)?.focus();
    }
  }, [editing, value]);

  const commit = useCallback(() => {
    setEditing(false);
    if (props.type === "number") {
      const n = Number(draft);
      if (!Number.isNaN(n)) onCommit(n as never);
    } else {
      const trimmed = draft.trim();
      if (trimmed.length > 0) onCommit(trimmed as never);
    }
  }, [draft, onCommit, props.type]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(String(value));
  }, [value]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  if (editing) {
    if (props.type === "select") {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          className={styles.select}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          data-testid={testId ? `${testId}-select` : undefined}
          autoFocus
        >
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        className={styles.input}
        type={props.type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        maxLength={props.type === "text" ? props.maxLength : undefined}
        min={props.type === "number" ? props.min : undefined}
        max={props.type === "number" ? props.max : undefined}
        data-testid={testId ? `${testId}-input` : undefined}
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      className={[styles.display, disabled ? styles.disabled : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={() => {
        if (!disabled) setEditing(true);
      }}
      data-testid={testId}
      aria-label="Click to edit"
    >
      {renderDisplay ? renderDisplay(value as never) : String(value)}
    </button>
  );
}
