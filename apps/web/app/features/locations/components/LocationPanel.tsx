import { useState } from "react";
import type { LocationRequirement, LocationCandidate, PatchLocationCandidate } from "@oh-writers/domain";
import styles from "./LocationPanel.module.css";

interface LocationPanelProps {
  requirements: LocationRequirement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddCandidate: (
    requirementId: string,
    candidate: { name: string; address?: string | null; lat?: number | null; lng?: number | null; contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null; estimatedDailyFee?: number | null; permitNotes?: string | null; notes?: string | null; status: "candidate" | "visited" | "rejected" | "confirmed"; aiSuggested: boolean; aiReasoning?: string | null; }
  ) => void;
  onUpdateCandidate: (candidateId: string, patch: PatchLocationCandidate) => void;
  onConfirm: (requirementId: string, candidateId: string) => void;
  onRemoveCandidate: (candidateId: string) => void;
  onAskCesare: (requirementId: string) => void;
}

const STATUS_DOT: Record<string, string> = {
  confirmed: "#2d6a4f",
  scouting: "#d97706",
  pending: "#d8d6cd",
  locked: "#2d6a4f",
};

const CANDIDATE_STATUS_LABEL: Record<string, string> = {
  confirmed: "Confermata",
  visited: "Visitata",
  candidate: "Candidata",
  rejected: "Scartata",
};

function CandidateRow({
  candidate,
  requirementId,
  isConfirmed,
  onUpdateCandidate,
  onConfirm,
  onRemoveCandidate,
}: {
  candidate: LocationCandidate;
  requirementId: string;
  isConfirmed: boolean;
  onUpdateCandidate: (candidateId: string, patch: PatchLocationCandidate) => void;
  onConfirm: (requirementId: string, candidateId: string) => void;
  onRemoveCandidate: (candidateId: string) => void;
}) {
  const [expanded, setExpanded] = useState(isConfirmed);
  const [notes, setNotes] = useState(candidate.notes ?? "");
  const [contact, setContact] = useState(candidate.contactName ?? "");
  const [fee, setFee] = useState(candidate.estimatedDailyFee?.toString() ?? "");

  return (
    <div
      data-testid={`candidate-card-${candidate.id}`}
      className={`${styles.candidateCard} ${isConfirmed ? styles.confirmed : ""}`}
    >
      <button
        type="button"
        className={styles.candidateHead}
        onClick={() => setExpanded((v) => !v)}
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
          {CANDIDATE_STATUS_LABEL[candidate.status]}
        </span>
        <span className={styles.chevron}>{expanded ? "∧" : "∨"}</span>
      </button>

      {expanded && (
        <div className={styles.candidateBody}>
          {candidate.address && (
            <div className={styles.candidateRow}>
              <span>📍</span>
              <span>{candidate.address}</span>
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
              <label className={styles.fieldLabel}>Contatto</label>
              <input
                className={styles.fieldInput}
                value={contact}
                placeholder="Nome, email, telefono…"
                onChange={(e) => setContact(e.target.value)}
                onBlur={() =>
                  onUpdateCandidate(candidate.id, { contactName: contact || null })
                }
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>€ / giorno</label>
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
            <label className={styles.fieldLabel}>Note sopralluogo</label>
            <textarea
              className={styles.fieldTextarea}
              value={notes}
              placeholder="Impressioni, luce, rumore, accessibilità…"
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
              Scarta
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
                Segna visitata
              </button>
            )}
            {!isConfirmed && (
              <button
                type="button"
                data-testid={`confirm-candidate-btn-${candidate.id}`}
                className={styles.btnGreen}
                onClick={() => onConfirm(requirementId, candidate.id)}
              >
                ✓ Conferma
              </button>
            )}
          </div>
        </div>
      )}
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
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  return (
    <div className={styles.addForm} data-testid="add-candidate-form">
      <div className={styles.formField}>
        <label className={styles.fieldLabel}>Nome location</label>
        <input
          data-testid="candidate-name-input"
          className={styles.fieldInput}
          value={name}
          placeholder="Es. Via Tortona 18, Milano"
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.fieldLabel}>Indirizzo (opzionale)</label>
        <input
          data-testid="candidate-address-input"
          className={styles.fieldInput}
          value={address}
          placeholder="Indirizzo completo…"
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className={styles.addFormActions}>
        <button type="button" className={styles.btnGhost} onClick={onCancel}>
          Annulla
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
          + Aggiungi
        </button>
      </div>
    </div>
  );
}

export function LocationPanel({
  requirements,
  selectedId,
  onSelect,
  onAddCandidate,
  onUpdateCandidate,
  onConfirm,
  onRemoveCandidate,
  onAskCesare,
}: LocationPanelProps) {
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const selectedReq = requirements.find((r) => r.id === selectedId) ?? null;
  const confirmedCount = requirements.filter((r) => r.status === "confirmed").length;

  return (
    <aside className={styles.panel} data-testid="locations-panel">
      <div className={styles.panelHead}>
        <div className={styles.panelTitle} data-testid="locations-panel-title">
          LOCATION ({requirements.length})
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
          {confirmedCount} / {requirements.length} confermate
        </div>
      </div>

      <div className={styles.panelList}>
        {requirements.length === 0 && (
          <div className={styles.emptyState} data-testid="locations-empty-state">
            Nessuna location trovata. Sincronizza dal breakdown o aggiungi manualmente.
          </div>
        )}
        {requirements.map((req) => {
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
                    req.status === "pending"
                      ? "1.5px solid #88867e"
                      : "none",
                }}
              />
              <span className={styles.reqBody}>
                <span className={styles.reqName}>{req.name}</span>
                <span className={styles.reqMeta}>
                  {[req.intExt, req.timeOfDay.join(", ")]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · {req.sceneCount} {req.sceneCount === 1 ? "scena" : "scene"}
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
                  <span className={styles.reqNoLocation}>Nessun candidato</span>
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
            <span className={styles.detailTitle} data-testid="detail-title">{selectedReq.name}</span>
            <button
              type="button"
              className={styles.btnAgent}
              onClick={() => onAskCesare(selectedReq.id)}
              title="Chiedi suggerimenti a Cesare"
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
                + Aggiungi candidato
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
