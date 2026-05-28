# Types

## Zod is the source of truth

Never write TypeScript types by hand. Always infer from Zod schemas.

```typescript
export const ProjectSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  format: z.enum(["feature", "short", "series_episode", "pilot"]),
  genre: z
    .enum([
      "drama",
      "comedy",
      "thriller",
      "horror",
      "action",
      "sci-fi",
      "documentary",
      "other",
    ])
    .nullable(),
});

export type Project = z.infer<typeof ProjectSchema>;
```

## Drizzle types are inferred too

```typescript
type ProjectRow = typeof projects.$inferSelect;
type NewProject = typeof projects.$inferInsert;
```

## Branded types for IDs

Prevents mixing up entity IDs at the type level.

```typescript
type ProjectId = Brand<string, "ProjectId">;
type ScreenplayId = Brand<string, "ScreenplayId">;
type SceneId = Brand<string, "SceneId">;
```

## Tagged const objects over switch/if-else

```typescript
export const TeamRoles = {
  OWNER: "owner",
  EDITOR: "editor",
  VIEWER: "viewer",
} as const;

export type TeamRole = (typeof TeamRoles)[keyof typeof TeamRoles];
```

## Discriminated unions for domain variants

```typescript
type DocumentType =
  | { type: "logline"; maxLength: 200 }
  | { type: "synopsis"; sections: string[] }
  | { type: "outline"; acts: Act[] }
  | { type: "treatment"; wordCount: number };
```
