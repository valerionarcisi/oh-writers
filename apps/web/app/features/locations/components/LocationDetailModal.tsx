import { useEffect, useState } from "react";
import type {
  LocationCandidate,
  PatchLocationCandidate,
} from "@oh-writers/domain";
import { Dialog } from "@oh-writers/ui";
import { PhotoLightbox } from "./PhotoLightbox";
import styles from "./LocationDetailModal.module.css";

interface LocationDetailModalProps {
  candidate: LocationCandidate | null;
  isOpen: boolean;
  onClose: () => void;
  onCenterMap: (candidateId: string) => void;
  onUpdate: (candidateId: string, patch: PatchLocationCandidate) => void;
  onConfirm: (candidateId: string) => void;
  onMarkVisited: (candidateId: string) => void;
  onRemove: (candidateId: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confermata",
  visited: "Visitata",
  candidate: "Candidata",
  rejected: "Scartata",
};

export function LocationDetailModal({
  candidate,
  isOpen,
  onClose,
  onCenterMap,
  onUpdate,
  onConfirm,
  onMarkVisited,
  onRemove,
}: LocationDetailModalProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (candidate) {
      setContact(candidate.contactName ?? "");
      setNotes(candidate.notes ?? "");
    }
  }, [candidate?.id, candidate?.contactName, candidate?.notes, candidate]);

  if (!candidate) return null;

  const photos = candidate.photos;
  const status = candidate.status;
  const isConfirmed = status === "confirmed";

  const handleCenterMap = () => {
    onCenterMap(candidate.id);
    onClose();
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title={candidate.name}
        size="lg"
        showCloseButton
        data-testid="location-detail-modal"
        actions={
          <div className={styles.footerRow}>
            <button
              type="button"
              className={styles.btnGhost}
              data-testid="detail-modal-remove-btn"
              onClick={() => {
                onRemove(candidate.id);
                onClose();
              }}
            >
              Scarta
            </button>
            {status !== "visited" && !isConfirmed ? (
              <button
                type="button"
                className={styles.btnGhost}
                data-testid="detail-modal-mark-visited-btn"
                onClick={() => onMarkVisited(candidate.id)}
              >
                Segna visitata
              </button>
            ) : null}
            {!isConfirmed ? (
              <button
                type="button"
                className={styles.btnPrimary}
                data-testid="detail-modal-confirm-btn"
                onClick={() => {
                  onConfirm(candidate.id);
                  onClose();
                }}
              >
                ✓ Conferma
              </button>
            ) : null}
          </div>
        }
      >
        <div className={styles.body}>
          <div
            className={`${styles.statusBadge} ${styles[`badge_${status}`] ?? ""}`}
            data-testid="detail-modal-status-badge"
          >
            {STATUS_LABEL[status] ?? status}
          </div>

          {photos.length > 0 ? (
            <div
              className={styles.photosGrid}
              data-testid="detail-modal-photos"
            >
              {photos.map((photo, idx) => (
                <button
                  key={photo.id}
                  type="button"
                  className={styles.photoTile}
                  data-testid={`detail-modal-photo-${idx}`}
                  onClick={() => setLightboxIndex(idx)}
                  aria-label={`Apri anteprima foto ${idx + 1}`}
                >
                  <img
                    src={photo.url}
                    alt={photo.caption ?? candidate.name}
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.noPhotos}>Nessuna foto disponibile</div>
          )}

          {candidate.address ||
          (candidate.lat != null && candidate.lng != null) ? (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Indirizzo</div>
              <div className={styles.addressRow}>
                <span className={styles.addressText}>
                  {candidate.address ??
                    `${candidate.lat?.toFixed(5)}, ${candidate.lng?.toFixed(5)}`}
                </span>
                <button
                  type="button"
                  className={styles.linkBtn}
                  data-testid="detail-modal-center-map-btn"
                  onClick={handleCenterMap}
                >
                  Centra sulla mappa
                </button>
                {candidate.lat != null && candidate.lng != null ? (
                  <a
                    className={styles.externalLink}
                    href={`https://www.google.com/maps?q=${candidate.lat},${candidate.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Maps ↗
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Contatto</div>
            <input
              type="text"
              className={styles.input}
              value={contact}
              placeholder="Nome, email, telefono…"
              data-testid="detail-modal-contact-input"
              onChange={(e) => setContact(e.target.value)}
              onBlur={() =>
                onUpdate(candidate.id, { contactName: contact || null })
              }
            />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionLabel}>Note sopralluogo</div>
            <textarea
              className={styles.textarea}
              value={notes}
              placeholder="Impressioni, luce, rumore, accessibilità…"
              rows={4}
              data-testid="detail-modal-notes-input"
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => onUpdate(candidate.id, { notes: notes || null })}
            />
          </div>

          {candidate.aiSuggested && candidate.aiReasoning ? (
            <div
              className={styles.aiReasoning}
              data-testid="detail-modal-ai-reasoning"
            >
              <span className={styles.aiTag}>✦ Cesare</span>
              {candidate.aiReasoning}
            </div>
          ) : null}
        </div>
      </Dialog>

      <PhotoLightbox
        photos={photos.map((p) => ({ url: p.url, caption: p.caption ?? null }))}
        initialIndex={lightboxIndex ?? 0}
        isOpen={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}
