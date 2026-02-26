# Spec 03 — Projects

## User Stories

- As a user I want to create a personal or team project
- As a user I want to see all my projects in a dashboard
- As a user I want to archive a project
- As a user I want to delete a project (with confirmation)

## Routes

```
/dashboard              → all projects (personal + team)
/projects/new           → project creation form
/projects/:id           → project overview (documents + screenplay)
/projects/:id/settings  → project settings
```

## tRPC Procedures

```ts
// projects.create(title, genre, format, teamId?) → Project
// projects.update(projectId, data) → Project
// projects.archive(projectId) → Project
// projects.restore(projectId) → Project
// projects.delete(projectId) → void
// projects.getById(projectId) → ProjectWithDocuments
// projects.listPersonal() → Project[]
// projects.listForTeam(teamId) → Project[]
```

## Data

```ts
type Genre =
  | "drama"
  | "comedy"
  | "thriller"
  | "horror"
  | "action"
  | "sci-fi"
  | "documentary"
  | "other";
type Format = "feature" | "short" | "series_episode" | "pilot";
```

## Business Rules

- On creation, 4 empty documents are automatically generated (logline, synopsis, outline, treatment) and an empty screenplay
- Only owner/editor can modify; viewer is read-only
- An archived project is read-only
- Deletion is only possible if the project is already archived (double-gate)

## UI — Dashboard

- Card for each project: title, format, genre, last updated date, team/personal badge
- Filters: all / personal / by team / archived
- Sort: last modified, title, creation date
- Search by title
- Empty state with CTA "Create your first project"

## UI — Project Overview

- Header: title, genre, format, team badge
- Development progress bar: how many of the 4 documents have been completed
- "Narrative Development" section: card for each document with a preview of the first lines
- "Screenplay" section: page count, last modified, "Open Editor" button
- "Team" section: member avatars with real-time presence

## Test Coverage

- Project creation → empty documents and screenplay created automatically
- Viewer cannot create/edit projects
- Archiving → project becomes read-only
- Deletion without archiving → error
