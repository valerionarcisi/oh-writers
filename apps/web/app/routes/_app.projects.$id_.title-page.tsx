import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { match } from "ts-pattern";
import {
  TitlePageEditor,
  TitlePageDraftPanel,
  useTitlePageState,
  useUpdateTitlePageState,
} from "~/features/projects";
import type { TitlePageState } from "~/features/projects";
import { ResultErrorView } from "~/components/ResultErrorView";
import styles from "./_app.projects.$id_.title-page.module.css";

const SAVE_DEBOUNCE_MS = 800;

export const Route = createFileRoute("/_app/projects/$id_/title-page")({
  component: TitlePageRoute,
});

function TitlePageRoute() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: result, isLoading } = useTitlePageState(id);
  const update = useUpdateTitlePageState();

  if (isLoading) return <div className={styles.status}>Loading…</div>;
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <TitlePageRouteInner
        projectId={id}
        projectTitle={value.projectTitle}
        initialState={value.state}
        canEdit={value.canEdit}
        onClose={() => navigate({ to: "/projects/$id", params: { id } })}
        saveError={update.error?.message ?? null}
        onSave={(next) => update.mutate({ projectId: id, state: next })}
      />
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}

interface InnerProps {
  projectId: string;
  projectTitle: string;
  initialState: TitlePageState;
  canEdit: boolean;
  onClose: () => void;
  onSave: (next: TitlePageState) => void;
  saveError: string | null;
}

function TitlePageRouteInner({
  projectId,
  projectTitle,
  initialState,
  canEdit,
  onClose,
  onSave,
  saveError,
}: InnerProps) {
  const [local, setLocal] = useState<TitlePageState>(initialState);
  const lastSavedRef = useRef<string>(JSON.stringify(initialState));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!canEdit) return;
    const serialized = JSON.stringify(local);
    if (serialized === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastSavedRef.current = serialized;
      onSave(local);
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // onSave is stable enough — including it would re-arm on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, canEdit]);

  const handleDocChange = (doc: Record<string, NonNullable<unknown>>) => {
    setLocal((prev) => ({ ...prev, doc }));
  };

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <Link
          to="/projects/$id"
          params={{ id: projectId }}
          className={styles.back}
        >
          ← {projectTitle}
        </Link>
        <button type="button" className={styles.back} onClick={onClose}>
          Close
        </button>
      </div>
      <h1 className={styles.title}>Frontespizio</h1>
      <p className={styles.subtitle}>
        Page one of every PDF export. Only the project owner can edit it.
      </p>

      <div className={styles.layout}>
        <TitlePageEditor
          projectTitle={projectTitle}
          initialDoc={initialState.doc}
          readOnly={!canEdit}
          onDocChange={handleDocChange}
        />
        <TitlePageDraftPanel
          projectId={projectId}
          draftDate={local.draftDate}
          draftColor={local.draftColor}
        />
      </div>

      {saveError && <p className={styles.formError}>{saveError}</p>}
    </div>
  );
}
