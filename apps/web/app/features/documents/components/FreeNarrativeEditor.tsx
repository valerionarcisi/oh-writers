import { useMemo } from "react";
import { formatInteger, type DocumentType } from "@oh-writers/domain";
import { NarrativeProseMirrorView } from "./NarrativeProseMirrorView";
import { toCartelle } from "../lib/cartelle-counter";
import { useTranslation } from "~/features/i18n";
import {
  useYjsRoom,
  PresenceIndicator,
  buildConnectedRealtime,
} from "~/features/realtime";
import { useSession } from "~/lib/auth-client";
import styles from "./FreeNarrativeEditor.module.css";

export interface FreeNarrativeEditorProps {
  readonly content: string;
  readonly onChange: (next: string) => void;
  readonly canEdit: boolean;
  readonly testId?: string;
  /** When true, renders only the editor + counter with no card wrapper. */
  readonly embedded?: boolean;
  /** When true, suppresses the internal cartelle/chars counter. Caller is
   *  expected to render a DocStats at page level instead. */
  readonly hideCounter?: boolean;
  /** Document type for the Cesare inline live-diff highlight (Spec 47d). */
  readonly diffDocumentType?: DocumentType;
  /** Document id for the realtime collab room (`document:<id>`). When provided
   *  and the user can edit, opens a Yjs room so edits sync between clients.
   *  Omitted/empty → HTTP-only autosave (Phase 1 behaviour). */
  readonly documentId?: string;
}

const stripHtmlTags = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

export function FreeNarrativeEditor({
  content,
  onChange,
  canEdit,
  testId,
  embedded = false,
  hideCounter = false,
  diffDocumentType,
  documentId,
}: FreeNarrativeEditorProps) {
  const { t, locale } = useTranslation();
  const { cartelle, chars } = useMemo(() => {
    const plain = stripHtmlTags(content);
    const c = plain.length;
    return { cartelle: toCartelle(c), chars: c };
  }, [content]);

  // ─── Realtime collaboration ────────────────────────────────────────────
  // Mirrors NarrativeEditor: open a Yjs room for the document, build the
  // `realtime` object only when fully connected, and degrade silently when
  // disabled (no VITE_WS_URL / no documentId / viewing read-only).
  const { data: sessionData } = useSession();
  const realtimeUser = sessionData?.user
    ? { id: sessionData.user.id, name: sessionData.user.name }
    : null;
  const room = useYjsRoom(
    documentId ? `document:${documentId}` : "",
    realtimeUser,
    canEdit && !!documentId,
  );
  const { status: realtimeStatus, peers: realtimePeers } = room;
  const realtime = buildConnectedRealtime(room);

  const inner = (
    <>
      {realtimeStatus !== "disabled" && (
        <div className={styles.presenceRow}>
          <PresenceIndicator status={realtimeStatus} peers={realtimePeers} />
        </div>
      )}
      <NarrativeProseMirrorView
        value={content}
        onChange={onChange}
        enableHeadings={true}
        readOnly={!canEdit}
        placeholder={t("documents.freeNarrative.placeholder")}
        diffDocumentType={diffDocumentType}
        realtime={realtime}
      />
      {!hideCounter && (
        <div className={styles.counter} aria-live="polite">
          {cartelle}{" "}
          {cartelle === 1
            ? t("documents.freeNarrative.cartellaOne")
            : t("documents.freeNarrative.cartellaOther")}{" "}
          · {formatInteger(chars, locale)}{" "}
          {t("documents.freeNarrative.characters")}
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div data-testid={testId}>{inner}</div>;
  }

  return (
    <div className={styles.root} data-testid={testId}>
      <div className={styles.page}>{inner}</div>
    </div>
  );
}
