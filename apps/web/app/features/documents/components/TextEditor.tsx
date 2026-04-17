import { useRef, useEffect } from "react";
import styles from "./TextEditor.module.css";

interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  singleLine?: boolean;
  readOnly?: boolean;
}

export function TextEditor({
  value,
  onChange,
  placeholder,
  maxLength,
  singleLine = false,
  readOnly = false,
}: TextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize: grow with content, never show scrollbar
  useEffect(() => {
    const el = ref.current;
    if (!el || singleLine) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, singleLine]);

  return (
    <div className={styles.wrapper}>
      <textarea
        ref={ref}
        className={`${styles.textarea} ${singleLine ? styles.singleLine : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={singleLine ? 1 : 6}
        spellCheck
        readOnly={readOnly}
      />
    </div>
  );
}
