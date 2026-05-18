# Spec 33 — User Settings Page

## Goal

A dedicated page at `/settings` where a user can manage their account: display name, avatar URL, and password. The team membership list is shown read-only (leave team is a future feature — out of scope for this spec).

---

## Route

`/settings` — inside the `_app` layout (authenticated), not tied to any project.

---

## Sections

### 1. Profile

Fields:
- **Name** — text input, required, min 1 char, max 100 chars
- **Email** — read-only display (cannot be changed here)
- **Avatar URL** — text input, optional, validated as URL; preview shown inline next to input

Save button → calls `updateUserProfile` server function.

### 2. Password

Shown only if the user's account was created via email/password (not OAuth-only).

Fields:
- Current password
- New password (min 8 chars)
- Confirm new password (must match)

Save button → calls `authClient.changePassword`.

Detecting OAuth-only: Better Auth's `useSession` returns `session.user` — check `accounts` table for password provider. Server function `getUserAccountProviders` returns `{ hasPassword: boolean }`.

### 3. Team memberships

Read-only list of teams the user belongs to, with their role badge.

Server function `getUserTeams` returns `Array<{ id, name, role }>`.

Leave team — **out of scope** for this spec.

---

## Server Functions

### `updateUserProfile`
- Input: `{ name: string; avatarUrl: string | null }`
- Auth: `requireUser()`
- DB: `UPDATE users SET name, avatar_url, updated_at WHERE id = userId`
- Returns: `ResultShape<{ name: string; avatarUrl: string | null }, ForbiddenError | DbError>`

### `getUserAccountProviders`
- Input: none
- Auth: `requireUser()`
- DB: `SELECT provider_id FROM accounts WHERE user_id = userId`
- Returns: `ResultShape<{ hasPassword: boolean }, ForbiddenError | DbError>`

### `getUserTeams`
- Input: none
- Auth: `requireUser()`
- DB: join `team_members` + `teams` WHERE `user_id = userId`
- Returns: `ResultShape<Array<{ id: string; name: string; role: TeamRole }>, ForbiddenError | DbError>`

---

## UI Components

```
features/user-settings/
├── components/
│   ├── UserSettingsPage.tsx
│   ├── UserSettingsPage.module.css
│   ├── ProfileSection.tsx
│   ├── PasswordSection.tsx
│   └── TeamsSection.tsx
├── server/
│   └── user-settings.server.ts
└── index.ts
```

---

## Navigation

In `_app.tsx` `userMenuItems`, add `{ label: "Impostazioni account", href: "/settings" }` above "Sign out".

---

## Tests (Playwright)

File: `tests/user-settings/user-settings.spec.ts`

| Tag | Scenario |
|-----|----------|
| OHW-500 | Profile section renders name, email, avatar URL inputs |
| OHW-501 | Updating name saves successfully |
| OHW-502 | Invalid avatar URL shows validation error |
| OHW-503 | Password section renders for email/password accounts |
| OHW-504 | Wrong current password shows error |
| OHW-505 | Password mismatch shows validation error |
| OHW-506 | Valid password change succeeds |
| OHW-507 | Teams section lists user's teams with role |
