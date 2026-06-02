import { useState } from "react";
import type {
  LocationRequirement,
  LocationCandidate,
  PatchLocationCandidate,
} from "@oh-writers/domain";
import type { TranslationKey } from "@oh-writers/domain";
import { useTranslation } from "~/features/i18n";
import { PlacesCombobox } from "./PlacesCombobox";
import type { PlaceSuggestion } from "../server/places-autocomplete.server";
import type { AreaFilterResult } from "../lib/area-filter";
import type { CrossMatchMap, CandidateCrossMatch } from "../lib/cross-match";
import styles from "./LocationPanel.module.css";

interface AddCandidatePayload {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  estimatedDailyFee?: number | null;
  permitNotes?: string | null;
  notes?: string | null;
  status: "candidate" | "visited" | "rejected" | "confirmed";
  aiSuggested: boolean;
  aiReasoning?: string | null;
  photoNames?: string[];
}

type RequirementFilter = "all" | "pending" | "scouting" | "confirmed";

const FILTER_LABEL_KEYS: Record<RequirementFilter, TranslationKey> = {
  all: "locations.filter.all",
  pending: "locations.filter.pending",
  scouting: "locations.filter.scouting",
  confirmed: "locations.filter.confirmed",
};

interface LocationPanelProps {
  requirements: LocationRequirement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedCandidateId: string | null;
  onCandidateSelect: (candidateId: string) => void;
  /** Called with the candidateId when the user hovers a card, null on leave. */
  onCandidateHover?: (candidateId: string | null) => void;
  onAddCandidate: (
    requirementId: string,
    candidate: AddCandidatePayload,
  ) => void;
  onUpdateCandidate: (
    candidateId: string,
    patch: PatchLocationCandidate,
  ) => void;
  onConfirm: (requirementId: string, candidateId: string) => void;
  onRemoveCandidate: (candidateId: string) => void;
  onAskCesare: (requirementId: string) => void;
  /** Bias passed to Google Places — e.g. project region or "Italia". */
  defaultLocationBias?: string;
  /** Active area filter from the map (boundary or drawn shape). */
  areaFilter?: AreaFilterResult | null;
  onDismissAreaFilter?: () => void;
  /** IDs to visually highlight in the candidate list. */
  highlightedCandidateIds?: ReadonlyArray<string>;
  /** candidateId → other requirements it could also serve (affinity chips). */
  crossMatches?: CrossMatchMap;
}

const STATUS_DOT: Record<string, string> = {
  confirmed: "#2d6a4f",
  scouting: "#d97706",
  pending: "#d8d6cd",
  locked: "#2d6a4f",
};

const CANDIDATE_STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
  confirmed: "locations.candidateStatus.confirmed",
  visited: "locations.candidateStatus.visited",
  candidate: "locations.candidateStatus.candidate",
  rejected: "locations.candidateStatus.rejected",
};

function CandidateRow({
  candidate,
  requirementId,
  isConfirmed,
  isSelected,
  crossMatches,
  onCandidateSelect,
  onCandidateHover,
  onUpdateCandidate,
  onConfirm,
  onRemoveCandidate,
}: {
  candidate: LocationCandidate;
  requirementId: string;
  isConfirmed: boolean;
  isSelected: boolean;
  crossMatches?: readonly CandidateCrossMatch[];
  onCandidateSelect: (candidateId: string) => void;
  onCandidateHover?: (candidateId: string | null) => void;
  onUpdateCandidate: (
    candidateId: string,
    patch: PatchLocationCandidate,
  ) => void;
  onConfirm: (requirementId: string, candidateId: string) => void;
  onRemoveCandidate: (candidateId: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(isConfirmed);
  const [notes, setNotes] = useState(candidate.notes ?? "");
  const [contact, setContact] = useState(candidate.contactName ?? "");
  const [fee, setFee] = useState(candidate.estimatedDailyFee?.toString() ?? "");

  const thumbnailUrl = candidate.photos[0]?.url ?? null;

  return (
    <div
      data-testid={`candidate-card-${candidate.id}`}
      data-entity-id={candidate.id}
      className={`${styles.candidateCard} ${isConfirmed ? styles.confirmed : ""} ${isSelected ? styles.candidateSelected : ""}`}
      onMouseEnter={() => onCandidateHover?.(candidate.id)}
      onMouseLeave={() => onCandidateHover?.(null)}
    >
      <div className={styles.candidateCardInner}>
        <div className={styles.candidateThumbnail} aria-hidden="true">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className={styles.candidateThumbnailImg}
            />
          ) : (
            <span className={styles.candidateThumbnailPlaceholder}>📍</span>
          )}
        </div>
        <div className={styles.candidateCardContent}>
          <div className={styles.candidateHeadRow}>
            <button
              type="button"
              className={styles.candidateHead}
              onClick={() => {
                setExpanded((v) => !v);
                onCandidateSelect(candidate.id);
              }}
            >
              <span
                className={styles.candidateStar}
                style={{ color: isConfirmed ? "#d97706" : "transparent" }}
                aria-hidden="true"
              >
                ★
              </span>
              <span className={styles.candidateName}>{candidate.name}</span>
              <span
                className={`${styles.candidateStatusBadge} ${styles[`badge_${candidate.status}`]}`}
              >
                {CANDIDATE_STATUS_LABEL_KEYS[candidate.status]
                  ? t(CANDIDATE_STATUS_LABEL_KEYS[candidate.status]!)
                  : candidate.status}
              </span>
              <span className={styles.chevron}>{expanded ? "∧" : "∨"}</span>
            </button>
            <button
              type="button"
              className={styles.openInMapsHeader}
              title={t("locations.action.centerMap")}
              aria-label={t("locations.action.centerMapAria").replace(
                "{name}",
                candidate.name,
              )}
              onClick={(e) => {
                e.stopPropagation();
                onCandidateSelect(candidate.id);
              }}
            >
              📍
            </button>
          </div>

          {crossMatches && crossMatches.length > 0 && (
            <div
              className={styles.affinityChips}
              data-testid={`affinity-${candidate.id}`}
            >
              <span className={styles.affinityLead}>
                {t("locations.panel.alsoGoodFor")}
              </span>
              {crossMatches.map((m) => (
                <span key={m.requirementId} className={styles.affinityChip}>
                  {m.requirementName}
                  <span className={styles.affinityScenes}>
                    {m.sceneCount}{" "}
                    {m.sceneCount === 1
                      ? t("locations.panel.sceneSingular")
                      : t("locations.panel.scenePlural")}
                  </span>
                </span>
              ))}
            </div>
          )}

          {expanded && (
            <div className={styles.candidateBody}>
              {(candidate.address || (candidate.lat && candidate.lng)) && (
                <div className={styles.candidateRow}>
                  <span>📍</span>
                  <span className={styles.candidateAddressText}>
                    {candidate.address ?? `${candidate.lat}, ${candidate.lng}`}
                  </span>
                </div>
              )}
              {candidate.aiSuggested && candidate.aiReasoning && (
                <div className={styles.aiReasoning}>
                  <span className={styles.aiTag}>✦ Cesare</span>
                  {candidate.aiReasoning}
                </div>
              )}

              <div className={styles.candidateForm}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>
                    {t("locations.field.contact")}
                  </label>
                  <input
                    className={styles.fieldInput}
                    value={contact}
                    placeholder={t("locations.field.contactPlaceholder")}
                    onChange={(e) => setContact(e.target.value)}
                    onBlur={() =>
                      onUpdateCandidate(candidate.id, {
                        contactName: contact || null,
                      })
                    }
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>
                    {t("locations.field.feePerDay")}
                  </label>
                  <input
                    className={styles.fieldInput}
                    type="number"
                    value={fee}
                    placeholder="—"
                    onChange={(e) => setFee(e.target.value)}
                    onBlur={() =>
                      onUpdateCandidate(candidate.id, {
                        estimatedDailyFee: fee ? parseFloat(fee) : null,
                      })
                    }
                  />
                </div>
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>
                  {t("locations.field.scoutingNotes")}
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  value={notes}
                  placeholder={t("locations.field.scoutingNotesPlaceholder")}
                  rows={3}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() =>
                    onUpdateCandidate(candidate.id, { notes: notes || null })
                  }
                />
              </div>

              <div className={styles.candidateActions}>
                <button
                  type="button"
                  data-testid={`remove-candidate-btn-${candidate.id}`}
                  className={styles.btnGhost}
                  onClick={() => onRemoveCandidate(candidate.id)}
                >
                  {t("locations.action.reject")}
                </button>
                {candidate.status !== "visited" && (
                  <button
                    type="button"
                    data-testid={`mark-visited-btn-${candidate.id}`}
                    className={styles.btnGhost}
                    onClick={() =>
                      onUpdateCandidate(candidate.id, { status: "visited" })
                    }
                  >
                    {t("locations.action.markVisited")}
                  </button>
                )}
                {!isConfirmed && (
                  <button
                    type="button"
                    data-testid={`confirm-candidate-btn-${candidate.id}`}
                    className={styles.btnGreen}
                    onClick={() => onConfirm(requirementId, candidate.id)}
                  >
                    {t("locations.action.confirm")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {/* candidateCardContent */}
      </div>
      {/* candidateCardInner */}
    </div>
  );
}

function AddCandidateForm({
  requirementId,
  onAdd,
  onCancel,
}: {
  requirementId: string;
  onAdd: (requirementId: string, candidate: any) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  return (
    <div className={styles.addForm} data-testid="add-candidate-form">
      <div className={styles.formField}>
        <label className={styles.fieldLabel}>
          {t("locations.field.locationName")}
        </label>
        <input
          data-testid="candidate-name-input"
          className={styles.fieldInput}
          value={name}
          placeholder={t("locations.field.locationNamePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.fieldLabel}>
          {t("locations.field.addressOptional")}
        </label>
        <input
          data-testid="candidate-address-input"
          className={styles.fieldInput}
          value={address}
          placeholder={t("locations.field.addressPlaceholder")}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className={styles.addFormActions}>
        <button type="button" className={styles.btnGhost} onClick={onCancel}>
          {t("locations.action.cancel")}
        </button>
        <button
          type="button"
          data-testid="save-candidate-btn"
          className={styles.btnPrimary}
          disabled={!name.trim()}
          onClick={() => {
            if (!name.trim()) return;
            onAdd(requirementId, {
              name: name.trim(),
              address: address.trim() || null,
              status: "candidate" as const,
              aiSuggested: false,
              aiReasoning: null,
            });
            onCancel();
          }}
        >
          {t("locations.action.add")}
        </button>
      </div>
    </div>
  );
}

export function LocationPanel({
  requirements,
  selectedId,
  onSelect,
  selectedCandidateId,
  onCandidateSelect,
  onCandidateHover,
  onAddCandidate,
  onUpdateCandidate,
  onConfirm,
  onRemoveCandidate,
  onAskCesare,
  areaFilter,
  onDismissAreaFilter,
  crossMatches,
}: LocationPanelProps) {
  const { t } = useTranslation();
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<RequirementFilter>("all");
  const selectedReq = requirements.find((r) => r.id === selectedId) ?? null;
  const confirmedCount = requirements.filter(
    (r) => r.status === "confirmed",
  ).length;

  const filteredRequirements =
    activeFilter === "all"
      ? requirements
      : requirements.filter((r) => r.status === activeFilter);

  return (
    <aside className={styles.panel} data-testid="locations-panel">
      <div className={styles.filterBar}>
        {(Object.keys(FILTER_LABEL_KEYS) as RequirementFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`${styles.filterChip} ${activeFilter === f ? styles.filterChipActive : ""}`}
            onClick={() => setActiveFilter(f)}
          >
            {t(FILTER_LABEL_KEYS[f])}
          </button>
        ))}
      </div>
      <div className={styles.panelHead}>
        <div className={styles.panelTitle} data-testid="locations-panel-title">
          {t("locations.panel.title")} ({requirements.length})
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{
              width: requirements.length
                ? `${(confirmedCount / requirements.length) * 100}%`
                : "0%",
            }}
          />
        </div>
        <div className={styles.progressLabel}>
          {t("locations.panel.confirmedCount").replace(
            "{value}",
            `${confirmedCount} / ${requirements.length}`,
          )}
        </div>
      </div>

      {areaFilter && (
        <div
          className={styles.areaFilterBanner}
          data-testid="area-filter-banner"
        >
          <span className={styles.areaFilterLabel}>
            {areaFilter.matchingCandidateIds.length > 0
              ? t("locations.areaFilter.matching")
                  .replace("{label}", areaFilter.label)
                  .replace(
                    "{count}",
                    String(areaFilter.matchingCandidateIds.length),
                  )
                  .replace(
                    "{candidates}",
                    areaFilter.matchingCandidateIds.length === 1
                      ? t("locations.areaFilter.candidateSingular")
                      : t("locations.areaFilter.candidatePlural"),
                  )
              : t("locations.areaFilter.none").replace(
                  "{label}",
                  areaFilter.label,
                )}
          </span>
          <div className={styles.areaFilterActions}>
            {areaFilter.matchingCandidateIds.length === 0 && (
              <button
                type="button"
                className={styles.areaFilterCesare}
                onClick={() => selectedId && onAskCesare(selectedId)}
                disabled={!selectedId}
              >
                ✦ {t("locations.areaFilter.askCesare")}
              </button>
            )}
            <button
              type="button"
              className={styles.areaFilterDismiss}
              aria-label={t("locations.areaFilter.removeAria")}
              onClick={onDismissAreaFilter}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className={styles.panelList}>
        {requirements.length === 0 && (
          <div
            className={styles.emptyState}
            data-testid="locations-empty-state"
          >
            {t("locations.panel.empty")}
          </div>
        )}
        {filteredRequirements.map((req) => {
          const confirmedCand = req.candidates.find(
            (c) => c.id === req.confirmedCandidateId,
          );
          const bestCand =
            confirmedCand ??
            req.candidates.find((c) => c.status === "visited") ??
            req.candidates[0];
          const isSelected = req.id === selectedId;

          return (
            <button
              key={req.id}
              type="button"
              data-testid={`requirement-row-${req.id}`}
              className={`${styles.reqRow} ${isSelected ? styles.reqRowActive : ""}`}
              onClick={() => onSelect(req.id)}
            >
              <span
                className={styles.reqDot}
                style={{
                  background: STATUS_DOT[req.status] ?? "#d8d6cd",
                  border:
                    req.status === "pending" ? "1.5px solid #88867e" : "none",
                }}
              />
              <span className={styles.reqBody}>
                <span className={styles.reqName}>{req.name}</span>
                <span className={styles.reqMeta}>
                  {[req.intExt, req.timeOfDay.join(", ")]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · {req.sceneCount}{" "}
                  {req.sceneCount === 1
                    ? t("locations.panel.sceneSingular")
                    : t("locations.panel.scenePlural")}
                </span>
                {bestCand ? (
                  <span
                    className={styles.reqLocation}
                    style={{
                      color:
                        bestCand.status === "confirmed"
                          ? "#2d6a4f"
                          : bestCand.status === "visited"
                            ? "#1d4ed8"
                            : "#88867e",
                    }}
                  >
                    {bestCand.name}
                  </span>
                ) : (
                  <span className={styles.reqNoLocation}>
                    {t("locations.panel.noCandidate")}
                  </span>
                )}
              </span>
              <span className={styles.reqCount}>{req.candidates.length}</span>
            </button>
          );
        })}
      </div>

      {selectedReq && (
        <div className={styles.detail} data-testid="requirement-detail">
          <div className={styles.detailDivider} />
          <div className={styles.detailHead}>
            <span className={styles.detailTitle} data-testid="detail-title">
              {selectedReq.name}
            </span>
            <button
              type="button"
              className={styles.btnAgent}
              onClick={() => onAskCesare(selectedReq.id)}
              title={t("locations.panel.askCesareTitle")}
            >
              ✦ Cesare
            </button>
          </div>

          <div className={styles.candidateList}>
            {selectedReq.candidates.map((c) => (
              <CandidateRow
                key={c.id}
                candidate={c}
                requirementId={selectedReq.id}
                isConfirmed={c.id === selectedReq.confirmedCandidateId}
                isSelected={c.id === selectedCandidateId}
                crossMatches={crossMatches?.get(c.id)}
                onCandidateSelect={onCandidateSelect}
                onCandidateHover={onCandidateHover}
                onUpdateCandidate={onUpdateCandidate}
                onConfirm={onConfirm}
                onRemoveCandidate={onRemoveCandidate}
              />
            ))}

            {addingFor === selectedReq.id ? (
              <AddCandidateForm
                requirementId={selectedReq.id}
                onAdd={onAddCandidate}
                onCancel={() => setAddingFor(null)}
              />
            ) : (
              <button
                type="button"
                data-testid="add-candidate-btn"
                className={styles.addCandidateBtn}
                onClick={() => setAddingFor(selectedReq.id)}
              >
                {t("locations.action.addCandidate")}
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
