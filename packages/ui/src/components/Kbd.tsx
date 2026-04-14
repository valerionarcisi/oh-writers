import styles from "./Kbd.module.css";

interface KbdProps {
  children: string;
  className?: string;
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd className={[styles.kbd, className ?? ""].filter(Boolean).join(" ")}>
      {children}
    </kbd>
  );
}
