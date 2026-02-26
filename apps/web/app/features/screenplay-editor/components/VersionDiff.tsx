import { Link } from "@tanstack/react-router";
import { diffScreenplays, diffStats } from "../lib/diff";
import type { VersionView } from "../screenplay-versions.schema";
import styles from "./VersionDiff.module.css";

interface VersionDiffProps {
  projectId: string;
  oldVersion: VersionView;
  newContent: string;
  newLabel: string;
}

export function VersionDiff({
  projectId,
  oldVersion,
  newContent,
  newLabel,
}: VersionDiffProps) {
  const lines = diffScreenplays(oldVersion.content, newContent);
  const stats = diffStats(lines);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link
          to="/projects/$id/screenplay/versions"
          params={{ id: projectId }}
          className={styles.backLink}
        >
          ← Versions
        </Link>
        <span className={styles.title}>Diff</span>
        <div className={styles.stats} data-testid="diff-stats">
          <span className={styles.statAdded}>+{stats.added} added</span>
          <span className={styles.statRemoved}>−{stats.removed} removed</span>
        </div>
      </div>

      <div className={styles.header}>
        <div className={styles.headerOld}>
          <span className={styles.headerLabel}>
            {oldVersion.label ?? "Auto-save"}
          </span>
          <span className={styles.headerDate}>
            {oldVersion.createdAt.toLocaleDateString()}{" "}
            {oldVersion.createdAt.toLocaleTimeString()}
          </span>
        </div>
        <div className={styles.headerNew}>
          <span className={styles.headerLabel}>{newLabel}</span>
        </div>
      </div>

      <div className={styles.diffArea}>
        <div className={styles.column} data-testid="diff-old">
          {lines
            .filter((l) => l.type !== "insert")
            .map((line, i) => (
              <div
                key={i}
                className={
                  line.type === "delete"
                    ? `${styles.line} ${styles.lineDelete}`
                    : styles.line
                }
              >
                <span className={styles.lineGutter}>
                  {line.type === "delete" ? "−" : " "}
                </span>
                <pre className={styles.lineText}>{line.text}</pre>
              </div>
            ))}
        </div>

        <div className={styles.divider} />

        <div className={styles.column} data-testid="diff-new">
          {lines
            .filter((l) => l.type !== "delete")
            .map((line, i) => (
              <div
                key={i}
                className={
                  line.type === "insert"
                    ? `${styles.line} ${styles.lineInsert}`
                    : styles.line
                }
              >
                <span className={styles.lineGutter}>
                  {line.type === "insert" ? "+" : " "}
                </span>
                <pre className={styles.lineText}>{line.text}</pre>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
