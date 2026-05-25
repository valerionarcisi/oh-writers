# Spec 02 — Teams

## User Stories

- As a user I want to create a team with a name and image
- As an owner I want to invite members via email with a role
- As an invitee I want to accept or decline an invitation from a link
- As an owner I want to change a member's role
- As an owner I want to remove a member
- As a member I want to leave a team

## Roles

```ts
type TeamRole = "owner" | "editor" | "viewer";

// owner:  everything (team management, projects, writing)
// editor: create/edit projects, write
// viewer: read-only
```

## Permission Matrix

| Action                 | Owner | Editor | Viewer |
| ---------------------- | ----- | ------ | ------ |
| Read project           | ✓     | ✓      | ✓      |
| Edit screenplay        | ✓     | ✓      | ✗      |
| Edit narrative docs    | ✓     | ✓      | ✗      |
| Create project         | ✓     | ✓      | ✗      |
| Archive/delete project | ✓     | ✗      | ✗      |
| Invite members         | ✓     | ✗      | ✗      |
| Change member roles    | ✓     | ✗      | ✗      |
| Remove members         | ✓     | ✗      | ✗      |
| Edit team settings     | ✓     | ✗      | ✗      |
| Delete team            | ✓     | ✗      | ✗      |

## Routes

```
/teams/new              → team creation form
/teams/:slug            → team dashboard (projects + members)
/teams/:slug/settings   → team settings (owner only)
/teams/:slug/members    → member management (owner only)
/invite/:token          → invitation acceptance page
```

## Server Functions

All client→server calls go through `createServerFn` (located in `features/teams/server/teams.server.ts`). No tRPC.

```ts
// createTeam({ name }) → ResultShape<Team, SlugConflictError | DbError>
// updateTeam({ teamId, name?, avatarUrl? }) → ResultShape<Team, TeamNotFoundError | ForbiddenError | DbError>
// deleteTeam({ teamId }) → ResultShape<void, TeamNotFoundError | ForbiddenError | DbError>
// getTeam({ slug }) → ResultShape<TeamWithMembers, TeamNotFoundError | ForbiddenError | DbError>
// listMyTeams() → Team[]

// inviteMember({ teamId, email, role }) → ResultShape<TeamInvitation, AlreadyMemberError | ForbiddenError | DbError>
// resendInvite({ invitationId }) → ResultShape<TeamInvitation, InvitationNotFoundError | ForbiddenError | DbError>
// revokeInvite({ invitationId }) → ResultShape<void, InvitationNotFoundError | ForbiddenError | DbError>
// acceptInvite({ token }) → ResultShape<TeamMember, InvitationNotFoundError | InvitationExpiredError | InvitationAlreadyAcceptedError | AlreadyMemberError | DbError>
// getInviteByToken({ token }) → ResultShape<{ invitation, team }, InvitationNotFoundError | TeamNotFoundError | DbError>
// updateMemberRole({ teamId, userId, role }) → ResultShape<TeamMember, TeamMemberNotFoundError | LastOwnerError | ForbiddenError | DbError>
// removeMember({ teamId, userId }) → ResultShape<void, TeamMemberNotFoundError | LastOwnerError | ForbiddenError | DbError>
// leaveTeam({ teamId }) → ResultShape<void, TeamMemberNotFoundError | LastOwnerError | ForbiddenError | DbError>
```

> **Billing dependency**: team creation does not yet require a subscription check.
> When Spec 16 billing is implemented, `createTeam` must gate on the Team plan.
> All callsites are marked with `// TODO(spec-16): gate on Team plan subscription`.

## Business Rules

- The slug is unique and immutable after creation
- A team must always have at least one owner
- The last owner cannot leave the team without transferring ownership
- An invitation expires after 7 days
- You cannot invite a user who is already a member
- An owner cannot demote themselves (must promote another owner first)

## UI — Team Dashboard

- List of team projects with status (active, archived)
- List of members with role and presence badge (online/offline via Redis)
- "Invite member" button (owner only)
- Team settings section (owner only): name, avatar, danger zone (delete team)

## UI — Invitation Acceptance

- Public page with invitation details (team name, role, who invited)
- If not logged in: prompt login/register then redirect back to the token
- Confirm acceptance → redirect to team dashboard

## Test Coverage

- Team creation → owner automatically added
- Email invitation → working link → member added with correct role
- Viewer cannot edit projects
- Last owner cannot leave
- Expired invitation → appropriate error
