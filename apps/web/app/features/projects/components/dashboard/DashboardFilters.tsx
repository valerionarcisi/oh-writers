import { Input } from "@oh-writers/ui";
import { TEAM_ROLE_LABELS_IT } from "@oh-writers/domain";
import {
  DashboardSortKeys,
  DashboardViewModes,
  type DashboardSortKey,
  type DashboardViewMode,
} from "../../dashboard.schema";
import styles from "./DashboardFilters.module.css";

export type FormatFilter =
  | "all"
  | "feature"
  | "short"
  | "series_episode"
  | "pilot";
export type GenreFilter = "all" | string;
export type RoleFilter = "all" | "owner" | "editor" | "viewer";

interface Props {
  readonly search: string;
  readonly onSearchChange: (q: string) => void;
  readonly format: FormatFilter;
  readonly onFormatChange: (f: FormatFilter) => void;
  readonly genre: GenreFilter;
  readonly onGenreChange: (g: GenreFilter) => void;
  readonly role: RoleFilter;
  readonly onRoleChange: (r: RoleFilter) => void;
  readonly sort: DashboardSortKey;
  readonly onSortChange: (s: DashboardSortKey) => void;
  readonly view: DashboardViewMode;
  readonly onViewChange: (v: DashboardViewMode) => void;
}

const FORMATS: ReadonlyArray<{ id: FormatFilter; label: string }> = [
  { id: "all", label: "Tutti i formati" },
  { id: "feature", label: "Lungometraggio" },
  { id: "short", label: "Cortometraggio" },
  { id: "series_episode", label: "Episodio serie" },
  { id: "pilot", label: "Pilota" },
];

const GENRES: ReadonlyArray<{ id: GenreFilter; label: string }> = [
  { id: "all", label: "Tutti i generi" },
  { id: "drama", label: "Dramma" },
  { id: "comedy", label: "Commedia" },
  { id: "thriller", label: "Thriller" },
  { id: "horror", label: "Horror" },
  { id: "action", label: "Azione" },
  { id: "sci-fi", label: "Sci-fi" },
  { id: "documentary", label: "Documentario" },
  { id: "other", label: "Altro" },
];

const ROLES: ReadonlyArray<{ id: RoleFilter; label: string }> = [
  { id: "all", label: "Tutti i ruoli" },
  { id: "owner", label: TEAM_ROLE_LABELS_IT.owner },
  { id: "editor", label: TEAM_ROLE_LABELS_IT.editor },
  { id: "viewer", label: TEAM_ROLE_LABELS_IT.viewer },
];

const SORTS: ReadonlyArray<{ id: DashboardSortKey; label: string }> = [
  { id: DashboardSortKeys.UPDATED, label: "Ultima modifica" },
  { id: DashboardSortKeys.TITLE, label: "Titolo A-Z" },
  { id: DashboardSortKeys.SCENES, label: "Numero scene" },
];

export function DashboardFilters({
  search,
  onSearchChange,
  format,
  onFormatChange,
  genre,
  onGenreChange,
  role,
  onRoleChange,
  sort,
  onSortChange,
  view,
  onViewChange,
}: Props) {
  return (
    <>
      <Input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Cerca progetto…"
        aria-label="Cerca progetto"
        className={styles.search}
      />
      <select
        className={styles.select}
        value={format}
        onChange={(e) => onFormatChange(e.target.value as FormatFilter)}
        aria-label="Filtra per formato"
      >
        {FORMATS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={genre}
        onChange={(e) => onGenreChange(e.target.value)}
        aria-label="Filtra per genere"
      >
        {GENRES.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={role}
        onChange={(e) => onRoleChange(e.target.value as RoleFilter)}
        aria-label="Filtra per ruolo"
      >
        {ROLES.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={sort}
        onChange={(e) => onSortChange(e.target.value as DashboardSortKey)}
        aria-label="Ordina"
      >
        {SORTS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <div
        className={styles.viewToggle}
        role="group"
        aria-label="Vista progetti"
      >
        <button
          type="button"
          aria-pressed={view === DashboardViewModes.GRID}
          className={`${styles.viewBtn} ${
            view === DashboardViewModes.GRID ? styles.viewBtnActive : ""
          }`}
          onClick={() => onViewChange(DashboardViewModes.GRID)}
        >
          Griglia
        </button>
        <button
          type="button"
          aria-pressed={view === DashboardViewModes.LIST}
          className={`${styles.viewBtn} ${
            view === DashboardViewModes.LIST ? styles.viewBtnActive : ""
          }`}
          onClick={() => onViewChange(DashboardViewModes.LIST)}
        >
          Lista
        </button>
      </div>
    </>
  );
}
