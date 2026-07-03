import type { FC } from "react";
import { match } from "ts-pattern";
import type { DocumentType } from "@oh-writers/domain";
import { NarrativeEditor } from "./NarrativeEditor";
import { useDocument } from "../hooks/useDocument";
import { emptyNarrativeDocument } from "../lib/empty-narrative-document";
import { ResultErrorView } from "~/components/ResultErrorView";
import { Skeleton } from "@oh-writers/ui";
import { useTranslation } from "~/features/i18n";
import styles from "../../../routes/_app.projects.$id_.editor.module.css";

interface DocumentRoutePageProps {
  readonly type: Exclude<DocumentType, "soggetto">;
  readonly projectId: string;
  readonly currentUser?: { readonly id: string; readonly name: string } | null;
}

export const DocumentRoutePage: FC<DocumentRoutePageProps> = ({
  type,
  projectId,
  currentUser = null,
}) => {
  const { t } = useTranslation();
  const { data: result, isLoading } = useDocument(projectId, type);

  if (isLoading)
    return (
      <div className={styles.status}>
        <Skeleton
          lines={5}
          widths={["50%", "100%", "100%", "75%", "60%"]}
          ariaLabel={t("documents.loading.document")}
        />
      </div>
    );
  if (!result) return null;

  return match(result)
    .with({ isOk: true }, ({ value }) => (
      <NarrativeEditor document={value} type={type} currentUser={currentUser} />
    ))
    .with({ isOk: false }, ({ error }) =>
      // A document that hasn't been written yet for a reachable project is an
      // empty editor, never a "Documento non trovato" overlay. The server
      // find-or-creates the row, so this branch is normally unreachable — but
      // if a transient leaves the doc unresolved we still render the empty
      // editor with its "Inizia a scrivere" placeholder rather than an error.
      // Only genuine project-level failures (missing / forbidden project, DB
      // error) surface the not-found / error body.
      match(error)
        .with({ _tag: "DocumentNotFoundError" }, () => (
          <NarrativeEditor
            document={emptyNarrativeDocument(projectId, type)}
            type={type}
            currentUser={currentUser}
          />
        ))
        .otherwise((e) => <ResultErrorView error={e} />),
    )
    .exhaustive();
};
