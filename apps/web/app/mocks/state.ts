import type {
  Project,
  Document,
  Screenplay,
  ScreenplayVersion,
} from "@oh-writers/db";
import {
  MOCK_PROJECTS,
  MOCK_DOCUMENTS,
  MOCK_SCREENPLAYS,
  MOCK_VERSIONS,
} from "./data/projects.data";

export type MockState = {
  projects: Project[];
  documents: Document[];
  screenplays: Screenplay[];
  versions: ScreenplayVersion[];
};

export let mockState: MockState = {
  projects: [...MOCK_PROJECTS],
  documents: [...MOCK_DOCUMENTS],
  screenplays: [...MOCK_SCREENPLAYS],
  versions: [...MOCK_VERSIONS],
};

export const setMockState = (next: MockState): void => {
  mockState = next;
};
