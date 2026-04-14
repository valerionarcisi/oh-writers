import type { ReactNode } from "react";
import styles from "./FormField.module.css";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  error,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={[styles.field, className ?? ""].filter(Boolean).join(" ")}>
      <label htmlFor={htmlFor} className={styles.label}>
        {label}
      </label>
      {children}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
