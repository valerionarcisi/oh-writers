import type { FC } from "react";
import { match } from "ts-pattern";
import type { DocumentType } from "@oh-writers/domain";
import { NarrativeEditor } from "./NarrativeEditor";
import { useDocument } from "../hooks/useDocument";
import { ResultErrorView } from "~/components/ResultErrorView";
import { Skeleton } from "@oh-writers/ui";
import styles from "../../../routes/_app.projects.$id_.editor.module.css";

interface DocumentRoutePageProps {
  readonly type: Exclude<DocumentType, "soggetto">;
  readonly projectId: string;
}

export const DocumentRoutePage: FC<DocumentRoutePageProps> = ({
  type,
  projectId,
}) => {
  const { data: result, isLoading } = useDocument(projectId, type);

  if (isLoading)
    return (
      <div className={styles.status}>
        <Skeleton
          lines={5}
          widths={["50%", "100%", "100%", "75%", "60%"]}
          ariaLabel="Caricamento documento"
        />
      </div>
    );
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <NarrativeEditor document={value} type={type} />
    ))
    .with({ isOk: false }, ({ error }) => <ResultErrorView error={error} />)
    .exhaustive();
};
