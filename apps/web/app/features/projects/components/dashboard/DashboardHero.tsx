import { useNavigate } from "@tanstack/react-router";
import { Button } from "@oh-writers/ui";
import styles from "./DashboardHero.module.css";

interface HeroStats {
  readonly activeCount: number;
  readonly totalScenes: number;
  readonly totalDays: number;
  readonly lastEditLabel: string;
}

interface Props {
  readonly stats: HeroStats;
}

export function DashboardHero({ stats }: Props) {
  const navigate = useNavigate();
  return (
    <section className={styles.hero}>
      <div className={styles.left}>
        <h1 className={styles.title}>I tuoi progetti</h1>
        <div className={styles.strip} aria-label="Riepilogo progetti">
          <b data-num>{stats.activeCount}</b> progetti attivi ·{" "}
          <b data-num>{stats.totalScenes}</b> scene totali ·{" "}
          <b data-num>{stats.totalDays}</b> giornate · ultima modifica{" "}
          <b>{stats.lastEditLabel}</b>
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" type="button" disabled>
          Importa Fountain
        </Button>
        <Button
          variant="primary"
          type="button"
          onClick={() => navigate({ to: "/projects/new" })}
        >
          + Nuovo progetto
        </Button>
      </div>
    </section>
  );
}
