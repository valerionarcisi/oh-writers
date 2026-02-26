import type {
  Project,
  Document,
  Screenplay,
  ScreenplayVersion,
} from "@oh-writers/db";
import { DocumentTypes, Formats, Genres } from "@oh-writers/shared";

export const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";

const now = new Date();
const yesterday = new Date(now.getTime() - 86_400_000);

export const MOCK_PROJECTS: Project[] = [
  {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    title: "The Last Signal",
    slug: "the-last-signal",
    genre: Genres.DRAMA,
    format: Formats.FEATURE,
    logline:
      "A radio operator receives a distress call from a ship that sank 20 years ago.",
    ownerId: MOCK_USER_ID,
    teamId: null,
    isArchived: false,
    createdAt: yesterday,
    updatedAt: now,
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000002",
    title: "Night Shift",
    slug: "night-shift",
    genre: Genres.THRILLER,
    format: Formats.SHORT,
    logline: null,
    ownerId: MOCK_USER_ID,
    teamId: null,
    isArchived: false,
    createdAt: yesterday,
    updatedAt: yesterday,
  },
  {
    id: "aaaaaaaa-0000-0000-0000-000000000003",
    title: "Old Project",
    slug: "old-project",
    genre: null,
    format: Formats.PILOT,
    logline: null,
    ownerId: MOCK_USER_ID,
    teamId: null,
    isArchived: true,
    createdAt: yesterday,
    updatedAt: yesterday,
  },
];

export const MOCK_DOCUMENTS: Document[] = MOCK_PROJECTS.flatMap((project) =>
  Object.values(DocumentTypes).map((type, i) => ({
    id: `dddddddd-0000-0000-${String(i).padStart(4, "0")}-${project.id.split("-").pop()!}`,
    projectId: project.id,
    type,
    title: type.charAt(0).toUpperCase() + type.slice(1),
    content:
      project.id === MOCK_PROJECTS[0]!.id && type === DocumentTypes.LOGLINE
        ? "A radio operator receives a distress call from a ship that sank 20 years ago."
        : "",
    yjsState: null,
    createdBy: MOCK_USER_ID,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  })),
);

const SCREENPLAY_CONTENT_DRAFT1 = `INT. RADIO STATION - NIGHT

MORGAN (30s, weathered) sits alone at a console of blinking lights.

      MORGAN
          (into headset)
          This is station KWRN. Is anyone out there?

Static. Then — a voice.

      GHOST (V.O.)
          Help us. The water is rising.

Morgan freezes.`;

const SCREENPLAY_CONTENT_CURRENT = `${SCREENPLAY_CONTENT_DRAFT1}

INT. RADIO STATION - CONTINUOUS

Morgan checks the maritime registry. The ship listed on the frequency sank in 2004.

      MORGAN
          That's... not possible.

She picks up the handset again, hands trembling.`;

export const MOCK_SCREENPLAYS: Screenplay[] = MOCK_PROJECTS.map((project) => ({
  id: `ssssssss-0000-0000-0000-${project.id.split("-").pop()!}`,
  projectId: project.id,
  title: project.title,
  pageCount: project.id === MOCK_PROJECTS[0]!.id ? 12 : 0,
  yjsState: null,
  content:
    project.id === MOCK_PROJECTS[0]!.id ? SCREENPLAY_CONTENT_CURRENT : "",
  createdBy: MOCK_USER_ID,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
}));

const firstScreenplayId = `ssssssss-0000-0000-0000-${MOCK_PROJECTS[0]!.id.split("-").pop()!}`;
const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);

export const MOCK_VERSIONS: ScreenplayVersion[] = [
  {
    id: "vvvvvvvv-0000-0000-0000-000000000001",
    screenplayId: firstScreenplayId,
    label: "Draft 1",
    content: SCREENPLAY_CONTENT_DRAFT1,
    yjsSnapshot: null,
    pageCount: 5,
    isAuto: false,
    createdBy: MOCK_USER_ID,
    createdAt: weekAgo,
  },
  {
    id: "vvvvvvvv-0000-0000-0000-000000000002",
    screenplayId: firstScreenplayId,
    label: null,
    content: SCREENPLAY_CONTENT_CURRENT,
    yjsSnapshot: null,
    pageCount: 12,
    isAuto: true,
    createdBy: MOCK_USER_ID,
    createdAt: twoDaysAgo,
  },
];
