import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwrapResult } from "@oh-writers/utils";
import { RATE_UNITS } from "@oh-writers/domain";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import { upsertRateEntry, deleteRateEntry } from "../server/budget.server";
import type { ProjectRateCard } from "../server/budget.server";
import styles from "./RateCardSection.module.css";

const FISCAL_LABEL_KEYS: Record<string, TranslationKey> = {
  piva: "budget.fiscal.piva",
  privato: "budget.fiscal.privato",
  none: "budget.fiscal.none",
};

const UNIT_LABEL_KEYS: Record<string, TranslationKey> = {
  giornata: "budget.unit.giornata",
  posa: "budget.unit.posa",
  forfait: "budget.unit.forfait",
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
  const { t } = useTranslation();
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
        <span className={styles.title}>{t("budget.rateCard.title")}</span>
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
            {t("budget.rateCard.add")}
          </button>
        )}
      </div>

      {(entries.length > 0 || adding) && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("budget.rateCard.colName")}</th>
              <th>{t("budget.rateCard.colRole")}</th>
              <th>{t("budget.rateCard.colUnit")}</th>
              <th className={styles.numCol}>{t("budget.rateCard.colRate")}</th>
              <th className={styles.numCol}>{t("budget.rateCard.colMeal")}</th>
              <th className={styles.numCol}>
                {t("budget.rateCard.colAccommodation")}
              </th>
              <th>{t("budget.rateCard.colRegime")}</th>
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
                  <td>
                    {UNIT_LABEL_KEYS[e.rateUnit]
                      ? t(UNIT_LABEL_KEYS[e.rateUnit]!)
                      : e.rateUnit}
                  </td>
                  <td className={styles.numCell}>
                    {Number(e.rateValue) === 0 ? (
                      <span className={styles.zero}>0 €</span>
                    ) : (
                      fmt(e.rateValue)
                    )}
                  </td>
                  <td className={styles.numCell}>
                    {fmt(e.mealAllowance) || "—"}
                  </td>
                  <td className={styles.numCell}>
                    {fmt(e.accommodation) || "—"}
                  </td>
                  <td className={styles.muted}>
                    {FISCAL_LABEL_KEYS[e.fiscalRegime]
                      ? t(FISCAL_LABEL_KEYS[e.fiscalRegime]!)
                      : e.fiscalRegime}
                  </td>
                  <td className={styles.actions}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => startEdit(e)}
                      title={t("budget.rateCard.edit")}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.deleteBtn}`}
                      onClick={() => deleteMutation.mutate(e.id)}
                      title={t("budget.rateCard.delete")}
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
        <p className={styles.empty}>{t("budget.rateCard.empty")}</p>
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
  const { t } = useTranslation();
  const set =
    (field: keyof DraftRow) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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
          placeholder={t("budget.rateCard.namePlaceholder")}
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
          placeholder={t("budget.rateCard.rolePlaceholder")}
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
              {UNIT_LABEL_KEYS[u] ? t(UNIT_LABEL_KEYS[u]!) : u}
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
          <option value="piva">{t("budget.fiscal.piva")}</option>
          <option value="privato">{t("budget.fiscal.privato")}</option>
          <option value="none">{t("budget.fiscal.none")}</option>
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
