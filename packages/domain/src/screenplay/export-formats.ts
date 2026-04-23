/**
 * Production export formats — see `docs/specs/core/05k-production-export-formats.md`.
 *
 * Each format describes a different transformation of the same screenplay
 * fountain text before PDF rendering. Used by the toolbar Export dropdown
 * and by the export server function.
 *
 * Pure module: no I/O, no React. Importable from any runtime.
 */

import { z } from "zod";

export const EXPORT_FORMATS = [
  "standard",
  "sides",
  "ad_copy",
  "reading_copy",
  "one_scene_per_page",
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportFormatMeta {
  readonly id: ExportFormat;
  readonly labelIt: string;
  readonly labelEn: string;
  readonly descriptionIt: string;
  readonly descriptionEn: string;
  /** True only for "sides" — UI must collect a non-empty scene-number list. */
  readonly requiresSceneSelection: boolean;
  /** Default value for `includeCoverPage` in the export modal. */
  readonly defaultIncludeCoverPage: boolean;
  /** Slug used in the generated PDF filename ("" → omitted). */
  readonly filenameSlug: string;
}

export const EXPORT_FORMAT_META: Record<ExportFormat, ExportFormatMeta> = {
  standard: {
    id: "standard",
    labelIt: "Standard",
    labelEn: "Standard",
    descriptionIt: "Copione completo, formato industria.",
    descriptionEn: "Full screenplay, industry layout.",
    requiresSceneSelection: false,
    defaultIncludeCoverPage: false,
    filenameSlug: "",
  },
  sides: {
    id: "sides",
    labelIt: "Sides (scene del giorno)",
    labelEn: "Sides (day's scenes)",
    descriptionIt: "Solo le scene scelte, pronte da portare sul set.",
    descriptionEn: "Only the chosen scenes, ready for set.",
    requiresSceneSelection: true,
    defaultIncludeCoverPage: false,
    filenameSlug: "sides",
  },
  ad_copy: {
    id: "ad_copy",
    labelIt: "AD copy (margine ampio)",
    labelEn: "AD copy (wide margin)",
    descriptionIt: "Margine destro extra per appunti di spoglio a mano.",
    descriptionEn: "Wide right margin for handwritten breakdown notes.",
    requiresSceneSelection: false,
    defaultIncludeCoverPage: false,
    filenameSlug: "ad-copy",
  },
  reading_copy: {
    id: "reading_copy",
    labelIt: "Reading copy (doppia interlinea)",
    labelEn: "Reading copy (double-spaced)",
    descriptionIt: "Doppia interlinea per lettori esterni.",
    descriptionEn: "Double line spacing for external readers.",
    requiresSceneSelection: false,
    defaultIncludeCoverPage: true,
    filenameSlug: "reading",
  },
  one_scene_per_page: {
    id: "one_scene_per_page",
    labelIt: "Una scena per pagina",
    labelEn: "One scene per page",
    descriptionIt: "Ogni scena inizia su una pagina nuova.",
    descriptionEn: "Each scene starts on a new page.",
    requiresSceneSelection: false,
    defaultIncludeCoverPage: true,
    filenameSlug: "scene-per-page",
  },
};

export const ExportFormatSchema = z.enum(EXPORT_FORMATS);
