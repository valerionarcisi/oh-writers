import type { AuthorEntry } from "../components/AuthorListField";
import type { SiaeExportInput, SiaeMetadata } from "../documents.schema";

export const DEFAULT_DURATION_MINUTES = 90;

export interface SiaeFormDefaults {
  readonly title: string;
  readonly declaredGenre: string;
  readonly ownerFullName: string | null;
  readonly savedMetadata?: SiaeMetadata | null;
}

export interface SiaeFormState {
  readonly title: string;
  readonly authors: ReadonlyArray<AuthorEntry>;
  readonly declaredGenre: string;
  readonly estimatedDurationMinutes: number;
  readonly compilationDate: string;
  readonly depositNotes: string;
}

// Formats a date as `yyyy-MM-dd` using the local timezone. We deliberately
// do not go through toISOString() because that would shift the date across
// midnight for users west of UTC.
export const formatDateYmd = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Pure builder — deterministic given its inputs. The `authorIdFactory` is
// injected so tests can assert stable ids without depending on randomUUID.
export const buildSiaeInitialState = (
  defaults: SiaeFormDefaults,
  now: Date = new Date(),
  authorIdFactory: () => string = () => crypto.randomUUID(),
): SiaeFormState => {
  const saved = defaults.savedMetadata ?? null;
  if (saved) {
    return {
      title: saved.title,
      authors: saved.authors.map((a) => ({
        id: authorIdFactory(),
        fullName: a.fullName,
        taxCode: a.taxCode,
      })),
      declaredGenre: saved.declaredGenre,
      estimatedDurationMinutes: saved.estimatedDurationMinutes,
      compilationDate: formatDateYmd(now),
      depositNotes: saved.depositNotes ?? "",
    };
  }
  return {
    title: defaults.title,
    authors: [
      {
        id: authorIdFactory(),
        fullName: defaults.ownerFullName ?? "",
        taxCode: null,
      },
    ],
    declaredGenre: defaults.declaredGenre,
    estimatedDurationMinutes: DEFAULT_DURATION_MINUTES,
    compilationDate: formatDateYmd(now),
    depositNotes: "",
  };
};

export const toSiaeMetadata = (state: SiaeFormState): SiaeMetadata => ({
  title: state.title.trim(),
  authors: state.authors.map((a) => ({
    fullName: a.fullName.trim(),
    taxCode: a.taxCode && a.taxCode.trim().length > 0 ? a.taxCode.trim() : null,
  })),
  declaredGenre: state.declaredGenre.trim(),
  estimatedDurationMinutes: state.estimatedDurationMinutes,
  depositNotes:
    state.depositNotes.trim().length > 0 ? state.depositNotes.trim() : null,
});

// Shape the form into the schema's input, normalising empty strings to null
// where the schema expects nullable.
export const toSiaeExportInput = (
  projectId: string,
  state: SiaeFormState,
): SiaeExportInput => ({
  projectId,
  title: state.title.trim(),
  authors: state.authors.map((a) => ({
    fullName: a.fullName.trim(),
    taxCode: a.taxCode && a.taxCode.trim().length > 0 ? a.taxCode.trim() : null,
  })),
  declaredGenre: state.declaredGenre.trim(),
  estimatedDurationMinutes: state.estimatedDurationMinutes,
  compilationDate: state.compilationDate,
  depositNotes:
    state.depositNotes.trim().length > 0 ? state.depositNotes.trim() : null,
});
