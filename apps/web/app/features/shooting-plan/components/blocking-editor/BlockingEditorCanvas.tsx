import { useRef, useState, useCallback } from "react";
import type { Primitive } from "@oh-writers/domain";
import { useConfirmDialog } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import type { EditorTool } from "./BlockingEditorToolbar";
import styles from "./BlockingEditorCanvas.module.css";

const DISPLAY_W = 900;
const GRID_SNAP = 50;

interface BlockingEditorCanvasProps {
  primitives: Primitive[];
  widthCm: number;
  heightCm: number;
  activeTool: EditorTool;
  snapOn: boolean;
  onChange: (primitives: Primitive[]) => void;
}

export function BlockingEditorCanvas({
  primitives,
  widthCm,
  heightCm,
  activeTool,
  snapOn,
  onChange,
}: BlockingEditorCanvasProps) {
  const scale = DISPLAY_W / widthCm;
  const displayH = heightCm * scale;
  const svgRef = useRef<SVGSVGElement>(null);
  const { promptText } = useConfirmDialog();
  const { t } = useTranslation();

  const [drawing, setDrawing] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const snap = useCallback(
    (v: number) =>
      snapOn ? Math.round(v / GRID_SNAP) * GRID_SNAP : Math.round(v),
    [snapOn],
  );

  const toCm = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: snap(Math.round((clientX - rect.left) / scale)),
        y: snap(Math.round((clientY - rect.top) / scale)),
      };
    },
    [scale, snap],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool === "select") return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const { x, y } = toCm(e.clientX, e.clientY);
    setDrawing({ x, y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const { x, y } = toCm(e.clientX, e.clientY);
    setPreview({
      x: Math.min(drawing.x, x),
      y: Math.min(drawing.y, y),
      w: Math.abs(x - drawing.x),
      h: Math.abs(y - drawing.y),
    });
  };

  const handlePointerUp = () => {
    if (!drawing || !preview || preview.w < 20 || preview.h < 10) {
      setDrawing(null);
      setPreview(null);
      return;
    }

    const box = { x: preview.x, y: preview.y, w: preview.w, h: preview.h };
    const commit = (p: Primitive) => onChange([...primitives, p]);

    // Furniture is the one tool that needs a name, so it commits after the
    // dialog resolves; the drag state is cleared up front either way so the
    // canvas is never left mid-stroke while the dialog is open.
    setDrawing(null);
    setPreview(null);

    if (activeTool === "furniture") {
      void promptText({
        title: t("shootingPlan.blocking.furnitureTitle"),
        message: "",
        label: t("shootingPlan.blocking.furnitureLabel"),
        initialValue: t("shootingPlan.blocking.furnitureDefault"),
      }).then((label) => {
        if (label === null) return;
        commit({ type: "furniture", ...box, label, propRef: null });
      });
      return;
    }

    commit(
      activeTool === "wall"
        ? { type: "wall", ...box }
        : { type: "opening", ...box, kind: "door" },
    );
  };

  const gridLines = () => {
    const lines = [];
    for (let x = 0; x <= widthCm; x += GRID_SNAP) {
      lines.push(
        <line
          key={`v${x}`}
          x1={x * scale}
          y1={0}
          x2={x * scale}
          y2={displayH}
          stroke="var(--color-border)"
          strokeWidth={0.5}
          opacity={0.4}
        />,
      );
    }
    for (let y = 0; y <= heightCm; y += GRID_SNAP) {
      lines.push(
        <line
          key={`h${y}`}
          x1={0}
          y1={y * scale}
          x2={DISPLAY_W}
          y2={y * scale}
          stroke="var(--color-border)"
          strokeWidth={0.5}
          opacity={0.4}
        />,
      );
    }
    return lines;
  };

  return (
    <svg
      ref={svgRef}
      className={styles.canvas}
      viewBox={`0 0 ${DISPLAY_W} ${displayH}`}
      width={DISPLAY_W}
      height={displayH}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: activeTool === "select" ? "default" : "crosshair" }}
    >
      {gridLines()}

      {primitives.map((p, i) => {
        const isSelected = selected === i;
        if (p.type === "wall") {
          return (
            <rect
              key={`p${i}`}
              x={p.x * scale}
              y={p.y * scale}
              width={p.w * scale}
              height={p.h * scale}
              fill="var(--color-text-muted)"
              opacity={0.6}
              stroke={isSelected ? "var(--color-accent)" : "none"}
              strokeWidth={2}
              onClick={() => setSelected(i)}
              style={{ cursor: "pointer" }}
            />
          );
        }
        if (p.type === "furniture") {
          return (
            <g
              key={`p${i}`}
              onClick={() => setSelected(i)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={p.x * scale}
                y={p.y * scale}
                width={p.w * scale}
                height={p.h * scale}
                fill="var(--color-surface)"
                stroke={
                  isSelected
                    ? "var(--color-accent)"
                    : "var(--color-border-strong)"
                }
                strokeWidth={isSelected ? 2 : 1}
                rx={2 * scale}
              />
              <text
                x={(p.x + p.w / 2) * scale}
                y={(p.y + p.h / 2) * scale + 4}
                textAnchor="middle"
                fontSize={Math.max(8, 10 * scale)}
                fill="var(--color-text-muted)"
                style={{ pointerEvents: "none" }}
              >
                {p.label}
              </text>
            </g>
          );
        }
        if (p.type === "opening") {
          return (
            <rect
              key={`p${i}`}
              x={p.x * scale}
              y={p.y * scale}
              width={p.w * scale}
              height={p.h * scale}
              fill="var(--color-bg)"
              stroke={
                isSelected
                  ? "var(--color-accent)"
                  : "var(--color-border-strong)"
              }
              strokeWidth={isSelected ? 2 : 1.5}
              onClick={() => setSelected(i)}
              style={{ cursor: "pointer" }}
            />
          );
        }
        return null;
      })}

      {preview && (
        <rect
          x={preview.x * scale}
          y={preview.y * scale}
          width={preview.w * scale}
          height={preview.h * scale}
          fill="var(--color-accent)"
          opacity={0.15}
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          strokeDasharray="4,3"
        />
      )}
    </svg>
  );
}
