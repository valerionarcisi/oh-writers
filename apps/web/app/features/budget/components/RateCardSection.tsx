import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { RATE_UNITS } from "@oh-writers/domain";
import { upsertRateEntry, deleteRateEntry } from "../server/budget.server";
import type { ProjectRateCard } from "../server/budget.server";
import styles from "./RateCardSection.module.css";

const FISCAL_LABELS: Record<string, string> = {
  piva: "P.IVA",
  privato: "Privato",
  none: "—",
};

const UNIT_LABELS: Record<string, string> = {
  giornata: "Giornata",
  posa: "Posa",
  forfait: "Forfait",
};

const fmt = (v: string | number) =>
  Number(v) === 0
    ? ""
    : new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(Number(v));

interface RateCardSectionProps {
  projectId: string;
  entries: ProjectRateCard[];
}

interface DraftRow {
  name: string;
  role: string;
  rateUnit: (typeof RATE_UNITS)[number];
  rateValue: string;
  mealAllowance: string;
  accommodation: string;
  fiscalRegime: "piva" | "privato" | "none";
}

const emptyDraft = (): DraftRow => ({
  name: "",
  role: "",
  rateUnit: "giornata",
  rateValue: "",
  mealAllowance: "",
  accommodation: "",
  fiscalRegime: "piva",
});

export function RateCardSection({ projectId, entries }: RateCardSectionProps) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftRow>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftRow>(emptyDraft());

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["rate-card", projectId] });

  const upsertMutation = useMutation({
    mutationFn: (d: DraftRow) =>
      upsertRateEntry({
        data: {
          projectId,
          name: d.name,
          role: d.role || null,
          rateUnit: d.rateUnit,
          rateValue: parseFloat(d.rateValue) || 0,
          mealAllowance: parseFloat(d.mealAllowance) || 0,
          accommodation: parseFloat(d.accommodation) || 0,
          fiscalRegime: d.fiscalRegime,
        },
      }).then(unwrapResult),
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setEditingId(null);
      setDraft(emptyDraft());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) =>
      deleteRateEntry({ data: { entryId } }).then(unwrapResult),
    onSuccess: invalidate,
  });

  const startEdit = (e: ProjectRateCard) => {
    setEditingId(e.id);
    setEditDraft({
      name: e.name,
      role: e.role ?? "",
      rateUnit: e.rateUnit as (typeof RATE_UNITS)[number],
      rateValue: e.rateValue === "0" ? "" : e.rateValue,
      mealAllowance: e.mealAllowance === "0" ? "" : e.mealAllowance,
      accommodation: e.accommodation === "0" ? "" : e.accommodation,
      fiscalRegime: e.fiscalRegime as "piva" | "privato" | "none",
    });
  };

  return (
    <div className={styles.section} data-testid="rate-card-section">
      <div className={styles.header}>
        <span className={styles.title}>Tariffe</span>
        {!adding && (
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => {
              setAdding(true);
              setDraft(emptyDraft());
            }}
            data-testid="add-rate-entry-btn"
          >
            + Aggiungi
          </button>
        )}
      </div>

      {(entries.length > 0 || adding) && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Ruolo</th>
              <th>Unità</th>
              <th className={styles.numCol}>€ / unità</th>
              <th className={styles.numCol}>Diaria</th>
              <th className={styles.numCol}>Alloggio</th>
              <th>Regime</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) =>
              editingId === e.id ? (
                <EditRow
                  key={e.id}
                  draft={editDraft}
                  onChange={setEditDraft}
                  onSave={() => upsertMutation.mutate(editDraft)}
                  onCancel={() => setEditingId(null)}
                  saving={upsertMutation.isPending}
                />
              ) : (
                <tr key={e.id} className={styles.row}>
                  <td className={styles.nameCell}>{e.name}</td>
                  <td className={styles.muted}>{e.role ?? "—"}</td>
                  <td>{UNIT_LABELS[e.rateUnit]}</td>
                  <td className={styles.numCell}>
                    {Number(e.rateValue) === 0 ? (
                      <span className={styles.zero}>0 €</span>
                    ) : (
                      fmt(e.rateValue)
                    )}
                  </td>
                  <td className={styles.numCell}>{fmt(e.mealAllowance) || "—"}</td>
                  <td className={styles.numCell}>{fmt(e.accommodation) || "—"}</td>
                  <td className={styles.muted}>{FISCAL_LABELS[e.fiscalRegime]}</td>
                  <td className={styles.actions}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => startEdit(e)}
                      title="Modifica"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.deleteBtn}`}
                      onClick={() => deleteMutation.mutate(e.id)}
                      title="Elimina"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ),
            )}
            {adding && (
              <EditRow
                draft={draft}
                onChange={setDraft}
                onSave={() => upsertMutation.mutate(draft)}
                onCancel={() => setAdding(false)}
                saving={upsertMutation.isPending}
                autoFocusName
              />
            )}
          </tbody>
        </table>
      )}

      {entries.length === 0 && !adding && (
        <p className={styles.empty}>
          Aggiungi le tariffe prima di generare il budget per pre-popolare
          cast e crew con i valori corretti.
        </p>
      )}
    </div>
  );
}

interface EditRowProps {
  draft: DraftRow;
  onChange: (d: DraftRow) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  autoFocusName?: boolean;
}

function EditRow({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  autoFocusName,
}: EditRowProps) {
  const set = (field: keyof DraftRow) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...draft, [field]: e.target.value });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSave();
    if (e.key === "Escape") onCancel();
  };

  return (
    <tr className={`${styles.row} ${styles.editRow}`}>
      <td>
        <input
          className={styles.editInput}
          value={draft.name}
          onChange={set("name")}
          onKeyDown={handleKeyDown}
          placeholder="Nome *"
          autoFocus={autoFocusName}
          data-testid="rate-name-input"
        />
      </td>
      <td>
        <input
          className={styles.editInput}
          value={draft.role}
          onChange={set("role")}
          onKeyDown={handleKeyDown}
          placeholder="Ruolo"
        />
      </td>
      <td>
        <select
          className={styles.editSelect}
          value={draft.rateUnit}
          onChange={set("rateUnit")}
        >
          {RATE_UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          className={`${styles.editInput} ${styles.numInput}`}
          type="number"
          min="0"
          value={draft.rateValue}
          onChange={set("rateValue")}
          onKeyDown={handleKeyDown}
          placeholder="0"
          data-testid="rate-value-input"
        />
      </td>
      <td>
        <input
          className={`${styles.editInput} ${styles.numInput}`}
          type="number"
          min="0"
          value={draft.mealAllowance}
          onChange={set("mealAllowance")}
          onKeyDown={handleKeyDown}
          placeholder="0"
        />
      </td>
      <td>
        <input
          className={`${styles.editInput} ${styles.numInput}`}
          type="number"
          min="0"
          value={draft.accommodation}
          onChange={set("accommodation")}
          onKeyDown={handleKeyDown}
          placeholder="0"
        />
      </td>
      <td>
        <select
          className={styles.editSelect}
          value={draft.fiscalRegime}
          onChange={set("fiscalRegime")}
        >
          <option value="piva">P.IVA</option>
          <option value="privato">Privato</option>
          <option value="none">—</option>
        </select>
      </td>
      <td className={styles.actions}>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={onSave}
          disabled={saving || !draft.name.trim()}
        >
          ✓
        </button>
        <button type="button" className={styles.iconBtn} onClick={onCancel}>
          ×
        </button>
      </td>
    </tr>
  );
}
