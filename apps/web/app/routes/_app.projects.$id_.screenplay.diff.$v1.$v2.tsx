import { createFileRoute } from "@tanstack/react-router";
import { VersionDiff } from "~/features/screenplay-editor/components/VersionDiff";
import { useVersion } from "~/features/screenplay-editor/hooks/useVersions";
import { useScreenplay } from "~/features/screenplay-editor";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute(
  "/_app/projects/$id_/screenplay/diff/$v1/$v2",
)({
  component: DiffPage,
});

function DiffPage() {
  const { id, v1, v2 } = Route.useParams();

  const oldVersionQuery = useVersion(v1);
  // v2 can be 'current' (compare vs live screenplay) or a version UUID
  const isV2Version = v2 !== "current";
  const newVersionQuery = useVersion(v2, isV2Version);
  const screenplayQuery = useScreenplay(id);

  const isLoading =
    oldVersionQuery.isLoading ||
    (v2 === "current" ? screenplayQuery.isLoading : newVersionQuery.isLoading);

  if (isLoading) return <div className={styles.status}>Loading diff…</div>;

  if (!oldVersionQuery.data?.isOk) {
    return <div className={styles.statusError}>Version not found.</div>;
  }

  const oldVersion = oldVersionQuery.data.value;

  if (v2 === "current") {
    if (!screenplayQuery.data?.isOk) {
      return <div className={styles.statusError}>Screenplay not found.</div>;
    }
    return (
      <VersionDiff
        projectId={id}
        oldVersion={oldVersion}
        newContent={screenplayQuery.data.value.content}
        newLabel="Current"
      />
    );
  }

  if (!newVersionQuery.data?.isOk) {
    return <div className={styles.statusError}>Version not found.</div>;
  }

  const newVersion = newVersionQuery.data.value;

  return (
    <VersionDiff
      projectId={id}
      oldVersion={oldVersion}
      newContent={newVersion.content}
      newLabel={newVersion.label ?? "Auto-save"}
    />
  );
}
