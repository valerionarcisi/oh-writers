# Spec 01b — Auth Implementation

## Context

Spec 01 defined the auth requirements. This spec covers the actual implementation: wiring Better Auth, building the sign-in/sign-up pages, protecting the app routes, and removing all `MOCK_API` stubs from the server functions.

After this spec the app no longer runs without a real PostgreSQL database and a real user account.

---

## Changes

### New files

| File                                                            | Purpose                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/web/app/server/auth.ts`                                   | Better Auth server instance (email/password + Google + GitHub)           |
| `apps/web/app/routes/api/auth/$.ts`                             | Catch-all API route for all Better Auth REST endpoints (`/api/auth/*`)   |
| `apps/web/app/lib/auth-client.ts`                               | Better Auth browser client — `signIn`, `signUp`, `signOut`, `useSession` |
| `apps/web/app/routes/login.tsx`                                 | `/login` page route                                                      |
| `apps/web/app/routes/register.tsx`                              | `/register` page route                                                   |
| `apps/web/app/features/auth/components/LoginForm.tsx`           | Email/password form + conditional OAuth buttons                          |
| `apps/web/app/features/auth/components/LoginForm.module.css`    |                                                                          |
| `apps/web/app/features/auth/components/RegisterForm.tsx`        | Name + email + password form                                             |
| `apps/web/app/features/auth/components/RegisterForm.module.css` |                                                                          |

### Modified files

| File                                                      | Change                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web/app/server/context.ts`                          | Replace `MOCK_USER` with `getUser(): Promise<AppUser \| null>`        |
| `apps/web/app/routes/_app.tsx`                            | Loader: redirect to `/login` if no session; pass `user` to `AppShell` |
| `apps/web/app/routes/index.tsx`                           | Redirect to `/login` unconditionally (auth guard lives in `_app`)     |
| `apps/web/app/features/app-shell/components/AppShell.tsx` | Accept `user: AppUser` prop                                           |
| `apps/web/app/features/app-shell/components/Sidebar.tsx`  | Show real name/email + sign-out button                                |
| 5 server function files                                   | Remove `isMock()`, mock imports, and mock branches; use `getUser()`   |

---

## Auth providers

- **Email + password** — always enabled, `requireEmailVerification: false` for simplicity
- **Google** — enabled only when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set
- **GitHub** — enabled only when `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` are set

OAuth buttons on the login page are rendered only for providers that are configured server-side. The loader passes `availableProviders: string[]` to the form component.

---

## Session flow

1. All `/_app/*` routes are protected by a loader in `_app.tsx` that calls `getUser()` — if null, redirects to `/login`
2. Server functions that need the current user call `getUser()` directly — if null, throw an error
3. Sign-out clears the Better Auth session cookie and redirects to `/login`

---

## No new dependencies

`better-auth` is already in `apps/web/package.json` at `1.4.19`. Forms use native React state + Zod (same pattern as `ProjectForm.tsx`). No `react-hook-form`.

---

## Playwright tests (follow-up required)

All existing Playwright tests use `MOCK_API=true`. After mock removal they cannot run without a test database. Updating the test suite to use a real DB is out of scope of this spec and must be addressed separately.

---

## Tests

| Tag     | Description                                                        |
| ------- | ------------------------------------------------------------------ |
| OHW-073 | Visiting `/dashboard` without a session redirects to `/login`      |
| OHW-074 | Registering with name + email + password redirects to `/dashboard` |
| OHW-075 | Signing in with correct credentials redirects to `/dashboard`      |
| OHW-076 | Signing in with wrong credentials shows an error message           |
| OHW-077 | Signing out redirects to `/login`                                  |
