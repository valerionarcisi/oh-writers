import { createContext, useContext, useMemo, useRef, useState } from "react";
import { useRadio, useRadioGroup } from "react-aria";
import { useRadioGroupState } from "react-stately";
import type { RadioGroupState } from "react-stately";
import { useQuery } from "@tanstack/react-query";
import { Button, Skeleton, Input } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import {
  modelCatalogueQueryOptions,
  type CatalogueModel,
} from "../model-catalogue.server";
import styles from "./AiModelPicker.module.css";

export interface ModelPickerValue {
  readonly fast: string;
  readonly quality: string;
}

export interface AiModelPickerProps {
  readonly recommendedFast: CatalogueModel;
  readonly recommendedQuality: CatalogueModel;
  readonly value: ModelPickerValue;
  readonly onChange: (value: ModelPickerValue) => void;
}

const formatPrice = (euro: number): string => euro.toFixed(2).replace(".", ",");

// Spec 84 §3 — the two recommended cards are pre-selected by default; the
// "Avanzate" disclosure exposes the FULL live catalogue (all providers) with
// a persistent quality-guarantee notice, never a second hardcoded list.
export function AiModelPicker({
  recommendedFast,
  recommendedQuality,
  value,
  onChange,
}: AiModelPickerProps) {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={styles.picker} data-testid="ai-model-picker">
      <p className={styles.intro}>{t("settings.ai.models.intro")}</p>

      <div className={styles.cards}>
        <RecommendedCard
          role="fast"
          label={t("settings.ai.models.fastLabel")}
          priceSuffix={t("settings.ai.models.pricePerFilmSuffix")}
          model={recommendedFast}
          selectedId={value.fast}
          onSelect={(id) => onChange({ ...value, fast: id })}
        />
        <RecommendedCard
          role="quality"
          label={t("settings.ai.models.qualityLabel")}
          priceSuffix={t("settings.ai.models.pricePerFilmSuffix")}
          model={recommendedQuality}
          selectedId={value.quality}
          onSelect={(id) => onChange({ ...value, quality: id })}
        />
      </div>

      <button
        type="button"
        className={styles.advancedToggle}
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((v) => !v)}
        data-testid="ai-model-advanced-toggle"
      >
        <span className={styles.advancedChevron} aria-hidden="true">
          {advancedOpen ? "▾" : "▸"}
        </span>
        {t("settings.ai.models.advancedToggle")}
      </button>

      {advancedOpen && <AdvancedCatalogue value={value} onChange={onChange} />}
    </div>
  );
}

function RecommendedCard({
  role,
  label,
  priceSuffix,
  model,
  selectedId,
  onSelect,
}: {
  role: "fast" | "quality";
  label: string;
  priceSuffix: string;
  model: CatalogueModel;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const isSelected = selectedId === model.id;
  return (
    <label
      className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
      data-testid={`ai-model-recommended-${role}`}
    >
      <input
        type="radio"
        name={`ai-model-${role}`}
        checked={isSelected}
        onChange={() => onSelect(model.id)}
        className={styles.cardRadio}
      />
      <span className={styles.cardRole}>{label}</span>
      <span className={styles.cardModelName}>{model.name}</span>
      <span className={styles.cardPrice}>
        ~{formatPrice(model.euroPerFeatureFilm)} {priceSuffix}
      </span>
    </label>
  );
}

// ─── Advanced: full live catalogue, react-aria radio group ─────────────────

const AdvancedRadioContext = createContext<RadioGroupState | null>(null);

function AdvancedCatalogue({
  value,
  onChange,
}: {
  value: ModelPickerValue;
  onChange: (value: ModelPickerValue) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [editingRole, setEditingRole] = useState<"fast" | "quality">("fast");
  const catalogueQuery = useQuery(modelCatalogueQueryOptions());

  const models: CatalogueModel[] = catalogueQuery.data?.isOk
    ? catalogueQuery.data.value
    : [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(needle) ||
        m.name.toLowerCase().includes(needle),
    );
  }, [models, search]);

  const currentValue = editingRole === "fast" ? value.fast : value.quality;
  const state = useRadioGroupState({
    value: currentValue,
    onChange: (id) =>
      onChange(
        editingRole === "fast"
          ? { ...value, fast: id as string }
          : { ...value, quality: id as string },
      ),
  });
  const { radioGroupProps } = useRadioGroup(
    { "aria-label": t("settings.ai.models.title"), orientation: "vertical" },
    state,
  );

  return (
    <div className={styles.advanced} data-testid="ai-model-advanced-panel">
      <p className={styles.advancedWarning} role="status">
        {t("settings.ai.models.advancedWarning")}
      </p>

      <div className={styles.advancedRoleToggle}>
        <button
          type="button"
          className={`${styles.roleTab} ${editingRole === "fast" ? styles.roleTabActive : ""}`}
          onClick={() => setEditingRole("fast")}
          data-testid="ai-model-advanced-role-fast"
        >
          {t("settings.ai.models.fastLabel")}
        </button>
        <button
          type="button"
          className={`${styles.roleTab} ${editingRole === "quality" ? styles.roleTabActive : ""}`}
          onClick={() => setEditingRole("quality")}
          data-testid="ai-model-advanced-role-quality"
        >
          {t("settings.ai.models.qualityLabel")}
        </button>
      </div>

      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("settings.ai.models.searchPlaceholder")}
        data-testid="ai-model-search-input"
      />

      {catalogueQuery.isLoading ? (
        <Skeleton lines={3} ariaLabel="Caricamento catalogo modelli" />
      ) : !catalogueQuery.data?.isOk ? (
        <p className={styles.loadError}>{t("settings.ai.models.loadError")}</p>
      ) : (
        <div className={styles.advancedList} {...radioGroupProps}>
          <AdvancedRadioContext.Provider value={state}>
            {filtered.map((m) => (
              <AdvancedModelRow key={m.id} model={m} />
            ))}
          </AdvancedRadioContext.Provider>
        </div>
      )}
    </div>
  );
}

function AdvancedModelRow({ model }: { model: CatalogueModel }) {
  const { t } = useTranslation();
  const state = useContext(AdvancedRadioContext);
  const ref = useRef<HTMLInputElement>(null);
  if (!state)
    throw new Error("AdvancedModelRow must be inside AdvancedCatalogue");
  const { inputProps } = useRadio(
    { value: model.id, "aria-label": model.name },
    state,
    ref,
  );
  const isSelected = state.selectedValue === model.id;

  return (
    <label
      className={`${styles.advancedRow} ${isSelected ? styles.advancedRowSelected : ""}`}
    >
      <input
        {...inputProps}
        ref={ref}
        data-testid={`ai-model-option-${model.id}`}
      />
      <span className={styles.advancedRowName}>{model.name}</span>
      <span className={styles.advancedRowPrice}>
        ~{formatPrice(model.euroPerFeatureFilm)}{" "}
        {t("settings.ai.models.pricePerFilmSuffix")}
      </span>
    </label>
  );
}
