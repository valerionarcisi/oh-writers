# Spec 01 — Authentication

## User Stories

- As a user I want to register with email and password
- As a user I want to sign in with Google or GitHub
- As a user I want to stay logged in across sessions (remember me)
- As a user I want to log out
- As a user I want to reset my password via email

## Stack

- **Better Auth** with the `organization` plugin for teams
- Sessions with httpOnly cookie, SameSite=Strict
- DB schema managed by Better Auth (users, sessions, accounts)

## Routes

```
/login                  → login page
/register               → registration page
/auth/callback/:provider → OAuth callback
/auth/reset-password    → password reset
/auth/verify-email      → email verification
```

## UI

- Login form: email + password + "Sign in with Google" + "Sign in with GitHub"
- Register form: name + email + password + confirm password
- Client-side validation with Zod + react-hook-form
- Redirect to `/dashboard` after login
- Redirect to `/login` for unauthenticated protected routes

## Server Functions

```ts
// loginAction(email, password) → Session | AuthError
// registerAction(name, email, password) → Session | AuthError
// logoutAction() → void
// oauthAction(provider) → redirect URL
```

## Error States

- Email already registered
- Wrong credentials (generic message for security)
- Email not verified
- Rate limit exceeded

## Middleware

Protected routes verify the session via TanStack Start middleware. The user is available in the context of every server function.

## Test Coverage

- Login with correct credentials → dashboard redirect
- Login with wrong credentials → error message
- Registration → verification email sent
- OAuth flow → redirect and account creation
- Accessing a protected route without auth → redirect to login
