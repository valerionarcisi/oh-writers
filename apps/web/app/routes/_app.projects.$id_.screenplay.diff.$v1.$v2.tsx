import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { match } from "ts-pattern";
import { VersionDiff } from "~/features/screenplay-editor/components/VersionDiff";
import { useVersion } from "~/features/screenplay-editor/hooks/useVersions";
import { screenplayQueryOptions } from "~/features/screenplay-editor";
import styles from "./_app.projects.$id_.editor.module.css";

export const Route = createFileRoute(
  "/_app/projects/$id_/screenplay/diff/$v1/$v2",
)({
  component: DiffPage,
});

const versionErrorMessage = (
  error:
    | { _tag: "VersionNotFoundError" }
    | { _tag: "ForbiddenError" }
    | { _tag: "DbError" },
): string =>
  match(error)
    .with({ _tag: "VersionNotFoundError" }, () => "Version not found.")
    .with({ _tag: "ForbiddenError" }, () => "You cannot view this version.")
    .with(
      { _tag: "DbError" },
      () => "Could not load the version. Please retry.",
    )
    .exhaustive();

const screenplayErrorMessage = (
  error: { _tag: "ScreenplayNotFoundError" } | { _tag: "DbError" },
): string =>
  match(error)
    .with({ _tag: "ScreenplayNotFoundError" }, () => "Screenplay not found.")
    .with(
      { _tag: "DbError" },
      () => "Could not load the screenplay. Please retry.",
    )
    .exhaustive();

function DiffPage() {
  const { id, v1, v2 } = Route.useParams();

  const oldVersionQuery = useVersion(v1);
  // v2 can be 'current' (compare vs live screenplay) or a version UUID
  const isV2Version = v2 !== "current";
  const newVersionQuery = useVersion(v2, isV2Version);
  // Always refetch on mount so the diff reflects the truly current screenplay,
  // not a stale cache entry (auto-save may have just updated the screenplay).
  const screenplayQuery = useQuery({
    ...screenplayQueryOptions(id),
    refetchOnMount: "always",
  });

  const isLoading =
    oldVersionQuery.isLoading ||
    (v2 === "current"
      ? screenplayQuery.isLoading || screenplayQuery.isFetching
      : newVersionQuery.isLoading);

  if (isLoading) return <div className={styles.status}>Loading diff…</div>;

  const oldData = oldVersionQuery.data;
  if (!oldData) return null;
  if (!oldData.isOk) {
    return (
      <div className={styles.statusError}>
        {versionErrorMessage(oldData.error)}
      </div>
    );
  }
  const oldVersion = oldData.value;

  if (v2 === "current") {
    const spData = screenplayQuery.data;
    if (!spData) return null;
    return match(spData)
      .with({ isOk: true }, ({ value }) => (
        <VersionDiff
          projectId={id}
          oldVersion={oldVersion}
          newContent={value.content}
          newLabel="Current"
        />
      ))
      .with({ isOk: false }, ({ error }) => (
        <div className={styles.statusError}>
          {screenplayErrorMessage(error)}
        </div>
      ))
      .exhaustive();
  }

  const newData = newVersionQuery.data;
  if (!newData) return null;
  return match(newData)
    .with({ isOk: true }, ({ value }) => (
      <VersionDiff
        projectId={id}
        oldVersion={oldVersion}
        newContent={value.content}
        newLabel={value.label ?? "Auto-save"}
      />
    ))
    .with({ isOk: false }, ({ error }) => (
      <div className={styles.statusError}>{versionErrorMessage(error)}</div>
    ))
    .exhaustive();
}
