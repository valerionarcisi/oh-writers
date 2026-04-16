import {
  type ReactNode,
  useRef,
  useEffect,
  useCallback,
  useState,
} from "react";
import styles from "./Drawer.module.css";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
  onWidthChange?: (width: number) => void;
  "data-testid"?: string;
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 600;

export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  width = 360,
  onWidthChange,
  "data-testid": testId,
}: DrawerProps) {
  const [currentWidth, setCurrentWidth] = useState(width);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    setCurrentWidth(width);
  }, [width]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = currentWidth;
      e.preventDefault();
    },
    [currentWidth],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth.current + delta),
      );
      setCurrentWidth(next);
      onWidthChange?.(next);
    };
    const onUp = () => {
      isDragging.current = false;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [onWidthChange]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  return (
    <div className={styles.overlay} aria-hidden={!isOpen}>
      <div
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ""}`}
        style={{ ["--drawer-width" as string]: `${currentWidth}px` }}
        data-testid={testId}
        role="complementary"
        aria-label={title}
      >
        <div
          className={styles.resizeHandle}
          onMouseDown={handleMouseDown}
          aria-hidden="true"
        />
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Chiudi"
            data-testid="drawer-close"
          >
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
