import { Input } from "@oh-writers/ui";
import { TEAM_ROLE_LABELS_IT, type TranslationKey } from "@oh-writers/domain";
import {
  DashboardSortKeys,
  DashboardViewModes,
  type DashboardSortKey,
  type DashboardViewMode,
} from "../../dashboard.schema";
import { useTranslation } from "~/features/i18n";
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

const FORMATS: ReadonlyArray<{ id: FormatFilter; labelKey: TranslationKey }> = [
  { id: "all", labelKey: "dashboard.filter.formatAll" },
  { id: "feature", labelKey: "dashboard.filter.formatFeature" },
  { id: "short", labelKey: "dashboard.filter.formatShort" },
  { id: "series_episode", labelKey: "dashboard.filter.formatSeriesEpisode" },
  { id: "pilot", labelKey: "dashboard.filter.formatPilot" },
];

const GENRES: ReadonlyArray<{ id: GenreFilter; labelKey: TranslationKey }> = [
  { id: "all", labelKey: "dashboard.filter.genreAll" },
  { id: "drama", labelKey: "dashboard.filter.genreDrama" },
  { id: "comedy", labelKey: "dashboard.filter.genreComedy" },
  { id: "thriller", labelKey: "dashboard.filter.genreThriller" },
  { id: "horror", labelKey: "dashboard.filter.genreHorror" },
  { id: "action", labelKey: "dashboard.filter.genreAction" },
  { id: "sci-fi", labelKey: "dashboard.filter.genreSciFi" },
  { id: "documentary", labelKey: "dashboard.filter.genreDocumentary" },
  { id: "other", labelKey: "dashboard.filter.genreOther" },
];

const SORTS: ReadonlyArray<{ id: DashboardSortKey; labelKey: TranslationKey }> =
  [
    { id: DashboardSortKeys.UPDATED, labelKey: "dashboard.filter.sortUpdated" },
    { id: DashboardSortKeys.TITLE, labelKey: "dashboard.filter.sortTitle" },
    { id: DashboardSortKeys.SCENES, labelKey: "dashboard.filter.sortScenes" },
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
  const { t } = useTranslation();
  const roles: ReadonlyArray<{ id: RoleFilter; label: string }> = [
    { id: "all", label: t("dashboard.filter.roleAll") },
    { id: "owner", label: TEAM_ROLE_LABELS_IT.owner },
    { id: "editor", label: TEAM_ROLE_LABELS_IT.editor },
    { id: "viewer", label: TEAM_ROLE_LABELS_IT.viewer },
  ];
  return (
    <>
      <Input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={t("dashboard.filter.searchPlaceholder")}
        aria-label={t("dashboard.filter.searchLabel")}
        className={styles.search}
      />
      <select
        className={styles.select}
        value={format}
        onChange={(e) => onFormatChange(e.target.value as FormatFilter)}
        aria-label={t("dashboard.filter.formatLabel")}
      >
        {FORMATS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={genre}
        onChange={(e) => onGenreChange(e.target.value)}
        aria-label={t("dashboard.filter.genreLabel")}
      >
        {GENRES.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={role}
        onChange={(e) => onRoleChange(e.target.value as RoleFilter)}
        aria-label={t("dashboard.filter.roleLabel")}
      >
        {roles.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        className={styles.select}
        value={sort}
        onChange={(e) => onSortChange(e.target.value as DashboardSortKey)}
        aria-label={t("dashboard.filter.sortLabel")}
      >
        {SORTS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
      <div
        className={styles.viewToggle}
        role="group"
        aria-label={t("dashboard.filter.viewLabel")}
      >
        <button
          type="button"
          aria-pressed={view === DashboardViewModes.GRID}
          className={`${styles.viewBtn} ${
            view === DashboardViewModes.GRID ? styles.viewBtnActive : ""
          }`}
          onClick={() => onViewChange(DashboardViewModes.GRID)}
        >
          {t("dashboard.filter.viewGrid")}
        </button>
        <button
          type="button"
          aria-pressed={view === DashboardViewModes.LIST}
          className={`${styles.viewBtn} ${
            view === DashboardViewModes.LIST ? styles.viewBtnActive : ""
          }`}
          onClick={() => onViewChange(DashboardViewModes.LIST)}
        >
          {t("dashboard.filter.viewList")}
        </button>
      </div>
    </>
  );
}
