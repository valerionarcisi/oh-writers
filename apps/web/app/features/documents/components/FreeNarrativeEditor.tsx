import { useMemo, useState } from "react";
import type { EditorView } from "prosemirror-view";
import { formatInteger } from "@oh-writers/domain";
import { Skeleton } from "@oh-writers/ui";
import { NarrativeProseMirrorView } from "./NarrativeProseMirrorView";
import { NarrativeFormatToolbar } from "./NarrativeFormatToolbar";
import { toCartelle } from "../lib/cartelle-counter";
import { useTranslation } from "~/features/i18n";
import {
  useYjsRoom,
  useRealtimeEditorGate,
  PresenceIndicator,
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
  /** Document id for the realtime collab room (`document:<id>`). When provided
   *  and the user can edit, opens a Yjs room so edits sync between clients.
   *  Omitted/empty → HTTP-only autosave (Phase 1 behaviour). */
  readonly documentId?: string;
  /** Document type (soggetto/synopsis/…). Arms the Cesare "Mostra cosa è
   *  cambiato" in-document underline (Spec 63) for this editor. */
  readonly documentType?: string;
  readonly currentUser?: { readonly id: string; readonly name: string } | null;
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
  documentId,
  documentType,
  currentUser = null,
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
  const realtimeUser = currentUser
    ? { id: currentUser.id, name: currentUser.name }
    : sessionData?.user
      ? { id: sessionData.user.id, name: sessionData.user.name }
      : null;
  const room = useYjsRoom(
    documentId ? `document:${documentId}` : "",
    realtimeUser,
    canEdit && !!documentId,
  );
  const { status: realtimeStatus, peers: realtimePeers } = room;
  // Same gate as NarrativeEditor (see useRealtimeEditorGate): realtime mounts
  // only AFTER the first sync (BUG-N41/BUG-N54 double-seed), the skeleton is
  // for the FIRST load only, and once an editor has mounted later status
  // oscillation never unmounts it (BUG-N57 remount loop).
  const { realtime, awaitingFirstSync: realtimeAwaitingSync } =
    useRealtimeEditorGate(room, {
      enabled: canEdit && !!documentId,
      resetKey: documentId ?? "",
    });

  const [editorView, setEditorView] = useState<EditorView | null>(null);

  const inner = (
    <>
      {realtimeStatus !== "disabled" && (
        <div className={styles.presenceRow}>
          <PresenceIndicator status={realtimeStatus} peers={realtimePeers} />
        </div>
      )}
      {canEdit && (
        <div className={styles.formatToolbar}>
          <NarrativeFormatToolbar view={editorView} enableHeadings={true} />
        </div>
      )}
      {realtimeAwaitingSync ? (
        <div aria-busy="true">
          <Skeleton
            lines={6}
            widths={["70%", "100%", "100%", "90%", "100%", "60%"]}
            ariaLabel={t("documents.loading.document")}
          />
        </div>
      ) : (
        <NarrativeProseMirrorView
          value={content}
          onChange={onChange}
          enableHeadings={true}
          readOnly={!canEdit}
          placeholder={t("documents.freeNarrative.placeholder")}
          realtime={realtime}
          onReady={setEditorView}
          {...(documentType ? { documentType } : {})}
        />
      )}
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
