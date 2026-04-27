import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { match } from "ts-pattern";
import {
  VersionDiff,
  useVersion,
  screenplayQueryOptions,
} from "~/features/screenplay-editor";
import { ResultErrorView } from "~/components/ResultErrorView";
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
    return <ResultErrorView error={oldData.error} />;
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
      .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
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
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
}
