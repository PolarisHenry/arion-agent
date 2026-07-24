# Implementation Plan - Multi-tenant Team Management Upgrade

We will upgrade the basic, stubbed Team Management and Workspace pages into a fully functional, professional multi-tenant team management system.

---

## Proposed Changes

### Database Layer

#### 1. Drizzle Schema Update
Define Drizzle schemas in `src/lib/auth-schema.ts` for:
- **workspace**: `id`, `name`, `ownerId` (references `user.id`), `createdAt`, `updatedAt`.
- **workspaceMember**: `id`, `workspaceId` (references `workspace.id`), `userId` (references `user.id`), `role` (enum: `'owner' | 'admin' | 'member'`), `createdAt`, `updatedAt`.
- **workspaceInvitation**: `id`, `workspaceId` (references `workspace.id`), `email`, `role`, `invitedBy` (references `user.id`), `status` (enum: `'pending' | 'accepted' | 'rejected'`), `createdAt`.

#### 2. Local Database Initialization
Update the auto-initialization script in `src/lib/db.ts` to ensure that if these tables don't exist, they are automatically created in SQLite on start-up.

---

### Backend API Layer

#### 1. Workspaces Endpoint (`src/app/api/workspaces/route.ts`)
- Rewrite `GET` and `POST` using Drizzle ORM instead of raw `better-sqlite3`.
- When creating a workspace, automatically add the creator as an `owner` in `workspace_member`.
- Set the newly created workspace as the active workspace in cookies.

#### 2. Workspace Members Endpoint (`src/app/api/workspaces/[id]/route.ts`)
- Fetch members using Drizzle ORM.
- Allow Owners/Admins to invite people by email:
  - If the user exists, add them directly to `workspace_member`.
  - If not, create a `workspace_invitation` record with `pending` status.
- Allow Owners/Admins to remove a member.
- Allow Owners to promote/demote members (Admin <-> Member).

#### 3. Pending Invitations Endpoint (`src/app/api/workspaces/[id]/invitations/route.ts`)
- List pending invitations.
- Allow cancelling an invitation.

#### 4. Automatic Invitation Acceptance (Auth Hook / Route)
- Intercept user registration: when a new user registers, check if there are pending invitations for their email. If so, automatically add them to those workspaces and accept the invitations.

---

### Frontend UI Layer

#### 1. Active Workspace Cookie Integration
- Read the `active_workspace_id` cookie on the server.
- Automatically fall back to the user's first workspace if the cookie is missing or invalid.

#### 2. Sidebar Workspace Switcher (`src/components/org-switcher.tsx`)
- Turn the static sidebar component into a real dropdown.
- Fetch all workspaces.
- Support switching workspaces (sets cookie, reloads page) and opening a dialog to create a new workspace.

#### 3. Team Management Page (`src/app/dashboard/workspaces/team/[[...rest]]/page.tsx`)
- Render a premium UI with:
  - **Members List**: Show avatar, name, email, badge for role (Owner, Admin, Member).
  - **Actions Dropdown**: Allow Owners/Admins to change roles or remove members.
  - **Invitations List**: Show pending invites with a "Revoke" button.
  - **Invite Input**: Form to invite a new user by email.

#### 4. Workspaces List Page (`src/app/dashboard/workspaces/page.tsx`)
- Redesign to view all workspaces, show active status, switch workspace, and create workspaces.
