import { forwardRef, type InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ hasError, className, ...props }, ref) => {
    const classes = [
      styles.input,
      hasError ? styles.error : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    return <input ref={ref} className={classes} {...props} />;
  },
);

Input.displayName = "Input";
