# Data Model

## Overview

All schemas are defined in `packages/db/schema/` with Drizzle ORM and validated with Zod in `packages/shared/schemas/`. TypeScript types are always inferred from the Zod schema — never defined manually.

---

## Entities

### users

```ts
users {
  id: UserId              // uuid, PK
  email: string           // unique, not null
  emailVerified: boolean
  name: string
  avatarUrl: string | null
  bio: string | null
  createdAt: timestamp
  updatedAt: timestamp
}
```

### sessions (managed by Better Auth)

```ts
sessions {
  id: string
  userId: UserId          // FK → users
  token: string           // unique
  expiresAt: timestamp
  ipAddress: string | null
  userAgent: string | null
  createdAt: timestamp
  updatedAt: timestamp
}
```

### accounts (OAuth — managed by Better Auth)

```ts
accounts {
  id: string
  userId: UserId          // FK → users
  provider: string        // 'google' | 'github' | 'credential'
  providerId: string
  accessToken: string | null
  refreshToken: string | null
  expiresAt: timestamp | null
  createdAt: timestamp
  updatedAt: timestamp
}
```

---

### teams

```ts
teams {
  id: TeamId              // uuid, PK
  name: string
  slug: string            // unique, URL-friendly
  avatarUrl: string | null
  createdBy: UserId       // FK → users
  createdAt: timestamp
  updatedAt: timestamp
}
```

### team_members

```ts
team_members {
  id: string
  teamId: TeamId          // FK → teams
  userId: UserId          // FK → users
  role: TeamRole          // 'owner' | 'editor' | 'viewer'
  invitedBy: UserId | null
  joinedAt: timestamp
}

// unique(teamId, userId)
```

### team_invitations

```ts
team_invitations {
  id: string
  teamId: TeamId          // FK → teams
  email: string
  role: TeamRole
  token: string           // unique, generated for the invitation link
  invitedBy: UserId
  expiresAt: timestamp
  acceptedAt: timestamp | null
  createdAt: timestamp
}
```

---

### projects

```ts
projects {
  id: ProjectId           // uuid, PK
  title: string
  slug: string
  genre: Genre | null     // 'drama' | 'comedy' | 'thriller' | 'horror' | 'action' | 'sci-fi' | 'documentary' | 'other'
  format: Format          // 'feature' | 'short' | 'series_episode' | 'pilot'
  logline: string | null  // cached current logline — updated on every logline document save
  ownerId: UserId | null  // FK → users (null if team-owned)
  teamId: TeamId | null   // FK → teams (null if user-owned)
  isArchived: boolean
  createdAt: timestamp
  updatedAt: timestamp
}

// check: ownerId IS NOT NULL OR teamId IS NOT NULL
// unique(teamId, slug), unique(ownerId, slug)
```

---

### documents

Narrative development documents (logline, synopsis, outline, treatment):

```ts
documents {
  id: DocumentId          // uuid, PK
  projectId: ProjectId    // FK → projects
  type: DocumentType      // 'logline' | 'synopsis' | 'outline' | 'treatment'
  title: string
  content: text           // markdown / plain text — kept in sync with Yjs on save
  yjsState: bytea | null  // serialized Yjs state — source of truth for live editing
  createdBy: UserId
  createdAt: timestamp
  updatedAt: timestamp
}

// unique(projectId, type) — one per type per project
```

---

### screenplays

```ts
screenplays {
  id: ScreenplayId        // uuid, PK
  projectId: ProjectId    // FK → projects, unique (1 screenplay per project in v1)
  title: string
  pageCount: number       // calculated and updated on save
  yjsState: bytea | null  // Yjs state — source of truth for live content
  content: text           // plaintext snapshot for search and diff
  createdBy: UserId
  createdAt: timestamp
  updatedAt: timestamp
}
```

### screenplay_versions

```ts
screenplay_versions {
  id: VersionId           // uuid, PK
  screenplayId: ScreenplayId
  label: string | null    // e.g. "Draft 1", "After producer notes"
  content: text
  yjsSnapshot: bytea | null
  pageCount: number
  isAuto: boolean         // true = automatic save, false = manual
  createdBy: UserId
  createdAt: timestamp
}
```

### screenplay_branches

```ts
screenplay_branches {
  id: BranchId
  screenplayId: ScreenplayId
  name: string
  fromVersionId: VersionId | null
  content: text
  yjsState: bytea | null
  createdBy: UserId
  createdAt: timestamp
  updatedAt: timestamp
}
```

---

### scenes

```ts
scenes {
  id: SceneId             // uuid, PK
  screenplayId: ScreenplayId
  number: number          // scene order — stable identity key for upserts
  heading: string         // e.g. "INT. MARCO'S HOUSE - DAY"
  intExt: IntExt          // 'INT' | 'EXT' | 'INT/EXT'
  location: string        // e.g. "MARCO'S HOUSE"
  timeOfDay: string | null
  pageStart: number | null
  pageEnd: number | null
  characterNames: string[]
  hasVehicle: boolean
  hasSpecialEffect: boolean
  notes: string | null
  updatedAt: timestamp
}

// unique(screenplayId, number)
// Scenes are upserted by position — renaming a heading updates in place.
// Predictions linked to SceneId are preserved across renames.
```

### characters

```ts
characters {
  id: CharacterId
  screenplayId: ScreenplayId
  name: string            // UPPERCASE as in screenplay
  displayName: string | null
  sceneCount: number
  dialogueLines: number
  updatedAt: timestamp
}
```

---

### ai_predictions

```ts
ai_predictions {
  id: PredictionId
  sceneId: SceneId        // FK → scenes (cascade delete)
  type: PredictionType    // 'production_cost' | 'weather_risk'
  input: jsonb
  output: jsonb
  model: string           // e.g. 'claude-haiku-4-5'
  tokensUsed: number | null
  createdAt: timestamp
}
```

---

## Production Module Entities

### breakdown_sheets

One per scene. Created automatically when AI breakdown is generated, then reviewed by the user.

```ts
breakdown_sheets {
  id: BreakdownSheetId    // uuid, PK
  sceneId: SceneId        // FK → scenes (unique — one sheet per scene)
  projectId: ProjectId    // FK → projects
  pageCount: number       // in eighths (e.g. 11 = 1 3/8 pages)
  shootingDayEstimate: number | null  // AI estimate of days needed for this scene
  notes: string | null
  status: BreakdownStatus // 'pending' | 'ai_generated' | 'in_review' | 'confirmed'
  createdAt: timestamp
  updatedAt: timestamp
}

// unique(sceneId)
```

### breakdown_elements

Individual production elements extracted per scene.

```ts
breakdown_elements {
  id: BreakdownElementId  // uuid, PK
  breakdownSheetId: BreakdownSheetId  // FK → breakdown_sheets (cascade delete)
  category: ElementCategory
    // 'cast' | 'extras' | 'props' | 'costumes'
    // 'locations' | 'vehicles' | 'vfx' | 'sfx' | 'sound' | 'notes'
  name: string
  description: string | null
  quantity: number | null
  aiGenerated: boolean    // true = extracted by AI, false = added manually
  confidence: number | null  // AI confidence 0–1, null if manually added
  sourceText: string | null  // excerpt from screenplay that generated this element
  confirmed: boolean      // true = reviewed and approved by user
  createdAt: timestamp
  updatedAt: timestamp
}
```

---

### budgets

One budget per project.

```ts
budgets {
  id: BudgetId            // uuid, PK
  projectId: ProjectId    // FK → projects (unique — one budget per project)
  currency: string        // default 'EUR'
  contingencyPercent: number  // default 10
  status: BudgetStatus    // 'draft' | 'ai_estimated' | 'in_review' | 'locked'
  generatedAt: timestamp | null
  createdAt: timestamp
  updatedAt: timestamp
}

// unique(projectId)
```

### budget_lines

Individual cost lines within a budget.

```ts
budget_lines {
  id: BudgetLineId        // uuid, PK
  budgetId: BudgetId      // FK → budgets (cascade delete)
  topSheetCategory: TopSheetCategory
    // 'above_the_line' | 'production' | 'crew' | 'post_production' | 'contingency'
  name: string
  costType: CostType      // 'daily' | 'flat' | 'weekly' | 'unit' | 'percentage'
  quantity: number | null // days, units, weeks
  rate: number | null     // cost per unit
  aiEstimate: number | null   // AI-generated total — read-only reference
  actual: number | null       // user-set value — overrides aiEstimate in calculations
  notes: string | null
  linkedElementCategory: ElementCategory | null  // which breakdown category feeds this line
  sortOrder: number       // display order within top sheet category
  createdAt: timestamp
  updatedAt: timestamp
}

// Effective value rule: actual ?? aiEstimate ?? 0
// Contingency is always calculated as % of sum of all non-contingency lines
```

---

### schedules

One schedule per project. Can have multiple versions (draft iterations).

```ts
schedules {
  id: ScheduleId          // uuid, PK
  projectId: ProjectId    // FK → projects
  version: number         // increments on each regeneration, default 1
  status: ScheduleStatus  // 'draft' | 'ai_suggested' | 'in_review' | 'locked'
  startDate: date | null  // first shooting day date, null until confirmed
  createdAt: timestamp
  updatedAt: timestamp
}
```

### shooting_days

Each row is one day in the schedule.

```ts
shooting_days {
  id: ShootingDayId       // uuid, PK
  scheduleId: ScheduleId  // FK → schedules (cascade delete)
  dayNumber: number       // 1-based, sequential
  date: date | null       // null until dates are confirmed
  dayType: DayType        // 'shoot' | 'travel' | 'rest' | 'prep'
  locationCandidateId: LocationCandidateId | null  // FK → location_candidates
  notes: string | null
  createdAt: timestamp
  updatedAt: timestamp
}

// unique(scheduleId, dayNumber)
```

### strips

One strip per scene, linking scene to shooting day.

```ts
strips {
  id: StripId             // uuid, PK
  sceneId: SceneId        // FK → scenes
  scheduleId: ScheduleId  // FK → schedules
  shootingDayId: ShootingDayId | null  // null = unscheduled
  position: number        // order within the shooting day (0-based)
  bannerColor: BannerColor
    // 'white' | 'yellow' | 'blue' | 'green' | 'red' | 'pink' | 'grey'
  isLocked: boolean       // locked strips cannot be moved
  createdAt: timestamp
  updatedAt: timestamp
}

// unique(scheduleId, sceneId) — one strip per scene per schedule
```

### schedule_constraints

User-defined constraints that the scheduler must respect.

```ts
schedule_constraints {
  id: ConstraintId        // uuid, PK
  scheduleId: ScheduleId  // FK → schedules (cascade delete)
  type: ConstraintType
    // 'cast_unavailable' | 'location_unavailable'
    // 'must_shoot_before' | 'must_shoot_together'
    // 'max_pages_per_day'
  payload: jsonb          // type-specific data (dates, sceneIds, limits)
  createdAt: timestamp
}
```

---

### location_requirements

Fictional places extracted from the breakdown. One per unique location in the screenplay.

```ts
location_requirements {
  id: LocationRequirementId  // uuid, PK
  projectId: ProjectId       // FK → projects
  name: string               // as it appears in the screenplay (e.g. "MARCO'S APARTMENT")
  description: string | null
  intExt: IntExt             // 'INT' | 'EXT' | 'INT/EXT'
  timeOfDay: string[]        // ['DAY', 'NIGHT'] etc.
  sceneIds: string[]         // scene IDs using this location (denormalized for query speed)
  confirmedCandidateId: LocationCandidateId | null  // FK → location_candidates
  status: LocationStatus     // 'pending' | 'scouting' | 'confirmed' | 'locked'
  createdAt: timestamp
  updatedAt: timestamp
}
```

### location_candidates

Real places being considered for a requirement.

```ts
location_candidates {
  id: LocationCandidateId    // uuid, PK
  requirementId: LocationRequirementId  // FK → location_requirements (cascade delete)
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  estimatedDailyFee: number | null  // synced to budget_lines on confirmation
  permitRequired: boolean | null
  permitNotes: string | null
  availableFrom: date | null
  availableTo: date | null
  notes: string | null
  status: CandidateStatus    // 'candidate' | 'visited' | 'rejected' | 'confirmed'
  aiSuggested: boolean
  createdAt: timestamp
  updatedAt: timestamp
}
```

### location_photos

Photos uploaded during scouting.

```ts
location_photos {
  id: LocationPhotoId        // uuid, PK
  candidateId: LocationCandidateId  // FK → location_candidates (cascade delete)
  url: string
  caption: string | null
  uploadedBy: UserId
  uploadedAt: timestamp
}
```

---

## Relationships (complete ERD)

```
users ──< team_members >── teams
users ──< projects
teams ──< projects
projects ──< documents
projects ──1── screenplays
projects ──1── budgets
projects ──< schedules
projects ──< location_requirements
screenplays ──< screenplay_versions
screenplays ──< screenplay_branches
screenplays ──< scenes
screenplays ──< characters
scenes ──< ai_predictions
scenes ──1── breakdown_sheets
breakdown_sheets ──< breakdown_elements
budgets ──< budget_lines
schedules ──< shooting_days
schedules ──< strips
schedules ──< schedule_constraints
strips ──── scenes
shooting_days ──── location_candidates
location_requirements ──< location_candidates
location_candidates ──< location_photos
```

---

## Drizzle Schema — Conventions

```ts
// packages/db/schema/users.ts
import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

---

## Seed Data

The seed (`scripts/seed.ts`) creates:

- 3 users (admin, writer1, writer2)
- 1 team "Editorial Studio" with all 3 members
- 2 projects: a short film and a feature film
- Complete development documents for one project
- A sample screenplay (~15 scenes) with characters and mock AI predictions
- A complete breakdown for the sample screenplay (all sheets confirmed)
- A draft budget with AI estimates
- A draft schedule with strips assigned to shooting days
- Sample location requirements with 2–3 candidates each
- Historical versions for testing versioning
