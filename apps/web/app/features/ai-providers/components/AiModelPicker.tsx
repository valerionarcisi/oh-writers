import { createContext, useContext, useMemo, useRef, useState } from "react";
import { useRadio, useRadioGroup } from "react-aria";
import { useRadioGroupState } from "react-stately";
import type { RadioGroupState } from "react-stately";
import { useQuery } from "@tanstack/react-query";
import { Skeleton, Input } from "@oh-writers/ui";
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

type Role = "fast" | "quality";

const formatPrice = (euro: number): string => euro.toFixed(2).replace(".", ",");

// Spec 84 §3, revised after a real-use report: the two cards are the ENTRY
// POINT for changing a role's model — click one and the full catalogue expands
// beneath, already scoped to that role. The old layout hid the catalogue
// behind a collapsed "Avanzate" toggle while the cards were radios that could
// only re-select the recommendation; worse, a card kept showing the
// recommended model even after a different one was chosen, so changing models
// looked like it had no effect.
export function AiModelPicker({
  recommendedFast,
  recommendedQuality,
  value,
  onChange,
}: AiModelPickerProps) {
  const { t } = useTranslation();
  // Which role's catalogue is expanded; null = both collapsed.
  const [openRole, setOpenRole] = useState<Role | null>(null);

  // The catalogue lives up here (not inside the expanded panel) so the cards
  // can name the model that is ACTUALLY selected, not the recommendation.
  const catalogueQuery = useQuery(modelCatalogueQueryOptions());
  const models: CatalogueModel[] = catalogueQuery.data?.isOk
    ? catalogueQuery.data.value
    : [];

  const resolve = (id: string, recommended: CatalogueModel) =>
    id === recommended.id
      ? recommended
      : (models.find((m) => m.id === id) ?? null);

  return (
    <div className={styles.picker} data-testid="ai-model-picker">
      <p className={styles.intro}>{t("settings.ai.models.intro")}</p>

      <div className={styles.cards}>
        <RoleCard
          role="fast"
          label={t("settings.ai.models.fastLabel")}
          priceSuffix={t("settings.ai.models.pricePerFilmSuffix")}
          changeHint={t("settings.ai.models.changeHint")}
          selectedId={value.fast}
          selectedModel={resolve(value.fast, recommendedFast)}
          isOpen={openRole === "fast"}
          onToggle={() => setOpenRole((r) => (r === "fast" ? null : "fast"))}
        />
        <RoleCard
          role="quality"
          label={t("settings.ai.models.qualityLabel")}
          priceSuffix={t("settings.ai.models.pricePerFilmSuffix")}
          changeHint={t("settings.ai.models.changeHint")}
          selectedId={value.quality}
          selectedModel={resolve(value.quality, recommendedQuality)}
          isOpen={openRole === "quality"}
          onToggle={() =>
            setOpenRole((r) => (r === "quality" ? null : "quality"))
          }
        />
      </div>

      {openRole && (
        <RoleCatalogue
          role={openRole}
          models={models}
          isLoading={catalogueQuery.isLoading}
          loadFailed={!catalogueQuery.isLoading && !catalogueQuery.data?.isOk}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** One role's slot: shows the model currently filling it and expands the
 *  catalogue for that role on click. */
function RoleCard({
  role,
  label,
  priceSuffix,
  changeHint,
  selectedId,
  selectedModel,
  isOpen,
  onToggle,
}: {
  role: Role;
  label: string;
  priceSuffix: string;
  changeHint: string;
  selectedId: string;
  selectedModel: CatalogueModel | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.card} ${isOpen ? styles.cardSelected : ""}`}
      aria-expanded={isOpen}
      onClick={onToggle}
      data-testid={`ai-model-role-${role}`}
    >
      <span className={styles.cardRole}>{label}</span>
      <span className={styles.cardModelName}>
        {/* While the catalogue is loading a non-recommended id has no name
            yet — the raw id is still truthful, a stale name would not be. */}
        {selectedModel?.name ?? selectedId}
      </span>
      {selectedModel && (
        <span className={styles.cardPrice}>
          ~{formatPrice(selectedModel.euroPerFeatureFilm)} {priceSuffix}
        </span>
      )}
      <span className={styles.cardHint} aria-hidden="true">
        {changeHint} {isOpen ? "▾" : "▸"}
      </span>
    </button>
  );
}

// ─── The catalogue, scoped to the clicked role ──────────────────────────────

const CatalogueRadioContext = createContext<RadioGroupState | null>(null);

function RoleCatalogue({
  role,
  models,
  isLoading,
  loadFailed,
  value,
  onChange,
}: {
  role: Role;
  models: CatalogueModel[];
  isLoading: boolean;
  loadFailed: boolean;
  value: ModelPickerValue;
  onChange: (value: ModelPickerValue) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(needle) ||
        m.name.toLowerCase().includes(needle),
    );
  }, [models, search]);

  const state = useRadioGroupState({
    value: role === "fast" ? value.fast : value.quality,
    onChange: (id) =>
      onChange(
        role === "fast"
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

      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("settings.ai.models.searchPlaceholder")}
        data-testid="ai-model-search-input"
      />

      {isLoading ? (
        <Skeleton lines={3} ariaLabel={t("settings.ai.models.loadingAria")} />
      ) : loadFailed ? (
        <p className={styles.loadError}>{t("settings.ai.models.loadError")}</p>
      ) : (
        <div className={styles.advancedList} {...radioGroupProps}>
          <CatalogueRadioContext.Provider value={state}>
            {filtered.map((m) => (
              <CatalogueModelRow key={m.id} model={m} />
            ))}
          </CatalogueRadioContext.Provider>
        </div>
      )}
    </div>
  );
}

function CatalogueModelRow({ model }: { model: CatalogueModel }) {
  const { t } = useTranslation();
  const state = useContext(CatalogueRadioContext);
  const ref = useRef<HTMLInputElement>(null);
  if (!state) throw new Error("CatalogueModelRow must be inside RoleCatalogue");
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
