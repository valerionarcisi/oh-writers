import { describe, it, expect } from "vitest";
import { DocumentTypes, TeamRoles } from "@oh-writers/domain";
import { __test__ } from "./dashboard.server";

const { assembleDashboardProjects } = __test__;

const baseProject = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Non fa ridere",
  slug: "non-fa-ridere",
  genre: "comedy" as const,
  format: "short" as const,
  logline: null,
  ownerId: "user-1",
  teamId: null,
  isArchived: false,
  titlePageAuthor: null,
  titlePageBasedOn: null,
  titlePageContact: null,
  titlePageDraftDate: null,
  titlePageDraftColor: null,
  titlePageWgaRegistration: null,
  titlePageNotes: null,
  titlePageDoc: null,
  siaeMetadata: null,
  locale: "it" as const,
  createdAt: new Date("2026-05-01T10:00:00Z"),
  updatedAt: new Date("2026-05-15T10:00:00Z"),
};

describe("assembleDashboardProjects", () => {
  it("flags personal project with no team as owner + isPersonal", () => {
    const [card] = assembleDashboardProjects({
      userId: "user-1",
      nowIso: "2026-05-15T12:00:00Z",
      projectRows: [baseProject],
      docs: [
        { projectId: baseProject.id, type: DocumentTypes.SYNOPSIS },
        { projectId: baseProject.id, type: DocumentTypes.OUTLINE },
      ],
      screenplayByProject: new Map([
        [
          baseProject.id,
          {
            projectId: baseProject.id,
            pageCount: 18,
            sceneCount: 24,
            characterCount: 7,
          },
        ],
      ]),
      scheduleByProject: new Map([
        [baseProject.id, { projectId: baseProject.id, shootDays: 5 }],
      ]),
      collaboratorsByTeam: new Map(),
    });

    expect(card).toBeDefined();
    expect(card!.isPersonal).toBe(true);
    expect(card!.isShared).toBe(false);
    expect(card!.role).toBe(TeamRoles.OWNER);
    expect(card!.stats.sceneCount).toBe(24);
    expect(card!.stats.pageCount).toBe(18);
    expect(card!.stats.scheduledDays).toBe(5);
    // 2 docs filled (40) + screenplay (20) = 60
    expect(card!.stats.completionPercent).toBe(60);
    expect(card!.lastActivity.kind).toBe("screenplay_edit");
    expect(card!.collaborators).toEqual([]);
    expect(card!.coverGradient).toMatch(/^linear-gradient/);
  });

  it("infers role from team membership when not owner", () => {
    const teamProject = {
      ...baseProject,
      id: "22222222-2222-2222-2222-222222222222",
      ownerId: null,
      teamId: "team-1",
    };

    const [card] = assembleDashboardProjects({
      userId: "user-2",
      nowIso: "2026-05-15T12:00:00Z",
      projectRows: [teamProject],
      docs: [],
      screenplayByProject: new Map(),
      scheduleByProject: new Map(),
      collaboratorsByTeam: new Map([
        [
          "team-1",
          [
            {
              teamId: "team-1",
              userId: "user-2",
              role: TeamRoles.EDITOR,
              name: "Maria",
              avatarUrl: null,
            },
            {
              teamId: "team-1",
              userId: "user-3",
              role: TeamRoles.OWNER,
              name: "Giuseppe",
              avatarUrl: null,
            },
          ],
        ],
      ]),
    });

    expect(card!.isShared).toBe(true);
    expect(card!.isPersonal).toBe(false);
    expect(card!.role).toBe(TeamRoles.EDITOR);
    expect(card!.collaborators).toHaveLength(2);
    expect(card!.stats.completionPercent).toBe(0);
    expect(card!.lastActivity.kind).toBe("project_created");
  });
});
