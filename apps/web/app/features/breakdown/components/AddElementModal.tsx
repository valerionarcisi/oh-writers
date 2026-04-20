import { useState } from "react";
import { Dialog } from "@oh-writers/ui";
import {
  BREAKDOWN_CATEGORIES,
  CATEGORY_META,
  type BreakdownCategory,
} from "@oh-writers/domain";
import { useAddBreakdownElement } from "../hooks/useBreakdown";
import styles from "./AddElementModal.module.css";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  versionId: string;
  sceneId: string;
}

export function AddElementModal({
  isOpen,
  onClose,
  projectId,
  versionId,
  sceneId,
}: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BreakdownCategory>("props");
  const [quantity, setQuantity] = useState<number>(1);
  const add = useAddBreakdownElement(projectId, versionId);

  const reset = () => {
    setName("");
    setCategory("props");
    setQuantity(1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    add.mutate(
      {
        projectId,
        category,
        name: trimmed,
        occurrence: {
          sceneId,
          screenplayVersionId: versionId,
          quantity,
        },
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Aggiungi elemento"
      actions={
        <>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Annulla
          </button>
          <button
            type="submit"
            form="add-element-form"
            className={styles.primary}
            data-testid="add-element-submit"
            disabled={add.isPending}
          >
            {add.isPending ? "Salvataggio…" : "Aggiungi"}
          </button>
        </>
      }
    >
      <form
        id="add-element-form"
        className={styles.form}
        onSubmit={handleSubmit}
      >
        <label className={styles.field}>
          <span className={styles.label}>Nome</span>
          <input
            type="text"
            className={styles.input}
            data-testid="add-element-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Categoria</span>
          <select
            className={styles.input}
            data-testid="add-element-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as BreakdownCategory)}
          >
            {BREAKDOWN_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].labelIt}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Quantità</span>
          <input
            type="number"
            className={styles.input}
            data-testid="add-element-quantity"
            min={1}
            value={quantity}
            onChange={(e) =>
              setQuantity(Math.max(1, Number(e.target.value) || 1))
            }
          />
        </label>
      </form>
    </Dialog>
  );
}
