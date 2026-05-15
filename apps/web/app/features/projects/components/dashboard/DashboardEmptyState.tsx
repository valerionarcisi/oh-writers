import { useNavigate } from "@tanstack/react-router";
import { Button } from "@oh-writers/ui";
import styles from "./DashboardEmptyState.module.css";

export function DashboardEmptyState() {
  const navigate = useNavigate();
  return (
    <section className={styles.empty} aria-labelledby="dashboard-empty-title">
      <svg
        className={styles.illustration}
        viewBox="0 0 220 140"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          x="20"
          y="14"
          width="180"
          height="112"
          rx="4"
          fill="none"
          stroke="currentColor"
          strokeDasharray="4 4"
        />
        <text
          x="34"
          y="44"
          fill="currentColor"
          fontFamily="var(--ds-font-mono)"
          fontSize="11"
        >
          FADE IN:
        </text>
        <text
          x="34"
          y="78"
          fill="currentColor"
          fontFamily="var(--ds-font-mono)"
          fontSize="11"
        >
          Una pagina bianca.
        </text>
        <rect x="34" y="98" width="6" height="14" fill="currentColor">
          <animate
            attributeName="opacity"
            values="1;0;1"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </rect>
      </svg>
      <h2 id="dashboard-empty-title" className={styles.heading}>
        Pagina bianca
      </h2>
      <p className={styles.body}>
        Inizia da una logline, importa un Fountain già scritto, o parti da un
        template pensato per il tuo formato.
      </p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          type="button"
          onClick={() => navigate({ to: "/projects/new" })}
        >
          Crea il primo progetto
        </Button>
        <Button variant="secondary" type="button">
          Importa Fountain
        </Button>
        <Button variant="ghost" type="button">
          Parti da template
        </Button>
      </div>
    </section>
  );
}
