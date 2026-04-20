import { useState, useRef, type MouseEvent } from "react";
import { ContextMenu, type ContextMenuItem } from "@oh-writers/ui";
import {
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
  type BreakdownCategory,
} from "@oh-writers/domain";
import type { BreakdownSceneSummary } from "../server/breakdown.server";
import { useAddBreakdownElement } from "../hooks/useBreakdown";
import styles from "./SceneScriptViewer.module.css";

interface Props {
  scene: BreakdownSceneSummary | null;
  projectId: string;
  versionId: string;
  canEdit: boolean;
}

export function SceneScriptViewer({
  scene,
  projectId,
  versionId,
  canEdit,
}: Props) {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const add = useAddBreakdownElement(projectId, versionId);

  if (!scene) {
    return <p className={styles.empty}>Seleziona una scena.</p>;
  }

  const openMenuFromSelection = (e: MouseEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (text.length === 0 || text.length > 200) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, text });
  };

  const tagAs = (category: BreakdownCategory) => {
    if (!menu || !scene) return;
    add.mutate({
      projectId,
      category,
      name: menu.text,
      occurrence: {
        sceneId: scene.id,
        screenplayVersionId: versionId,
        quantity: 1,
      },
    });
    setMenu(null);
  };

  const items: ContextMenuItem[] = BREAKDOWN_CATEGORIES.map((cat) => ({
    label: CATEGORY_META[cat].labelIt,
    onClick: () => tagAs(cat),
  }));

  return (
    <div
      ref={containerRef}
      className={styles.viewer}
      onContextMenu={openMenuFromSelection}
    >
      <h2
        className={styles.heading}
        data-testid={`scene-${scene.number}-heading`}
      >
        {scene.number}. {scene.heading}
      </h2>
      {scene.notes && <p className={styles.body}>{scene.notes}</p>}
      {menu && (
        <ContextMenu
          open
          anchor={{ x: menu.x, y: menu.y }}
          items={items}
          onClose={() => setMenu(null)}
          data-testid="breakdown-context-menu"
        />
      )}
    </div>
  );
}
