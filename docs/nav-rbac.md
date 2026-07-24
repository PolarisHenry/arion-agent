# Master-Sub-Account RBAC System

## Overview

This project uses a flat master-sub-account model with button-level RBAC (Role-Based Access Control). Each permission is a **concrete button/operation** that gates both a UI button (hidden when missing) and an API route (`requirePermission()`). Menus are not permissions — a menu is visible for a role iff the role holds **at least one** of that menu's button permissions.

## Architecture

### Account Model

- **Master Account**: `user.ownerId = null`. Created automatically on sign-up. Has **all permissions implicitly** — no role lookup needed. The master account is the tenant root; each master is an independent tenant.
- **Sub-Account**: `user.ownerId = <master user id>`. Created by the master account. Assigned a custom role whose permission set determines what they can access.

### Role System

- **Custom Roles** (`role.ownerId = <master user id>`): Created per master account. Each has a name, description, and `permissions: string[]` of button-permission codes. Sub-accounts are assigned these roles.
- Roles are tenant-scoped — a master account can only assign roles it created.
- Deleting a role that still has users assigned is rejected.

### Permission Catalog (button-level, config-driven — model A)

Defined in `src/lib/rbac/permissions.ts`. There is **no separate "menu visibility" permission**; each code is a button/operation, and menus derive visibility from their child buttons.

```typescript
PERMISSIONS.DASHBOARD_VIEW   // 'dashboard:view'

PERMISSIONS.PRODUCT_READ     // 'product:read'   PRODUCT_CREATE / UPDATE / DELETE
PERMISSIONS.USER_READ        // 'user:read'      USER_CREATE / UPDATE / DELETE
PERMISSIONS.ROLE_READ        // 'role:read'      ROLE_CREATE / UPDATE / DELETE
```

These are grouped into a menu tree via `PERMISSION_TREE`:

```typescript
PERMISSION_TREE = [
  { key: 'dashboard', labelKey: 'Dashboard', permissions: [DASHBOARD_VIEW] },
  { key: 'product',   labelKey: 'Product',   permissions: [PRODUCT_READ, PRODUCT_CREATE, PRODUCT_UPDATE, PRODUCT_DELETE] },
  { key: 'users',     labelKey: 'Users',     permissions: [USER_READ, USER_CREATE, USER_UPDATE, USER_DELETE] },
  { key: 'roles',     labelKey: 'Roles',     permissions: [ROLE_READ, ROLE_CREATE, ROLE_UPDATE, ROLE_DELETE] }
];
```

A role's `permissions` array may contain any subset of these codes. The catalog is the single source of truth and is validated on role create/update (`permissions ⊆ ALL_PERMISSIONS`). Each permission code is also an i18n key (see `src/lib/i18n.ts`) so labels render localized.

## How It Works

### API Layer (Server-Side — REAL Security)

Every protected API route calls `requirePermission()` at the top with the specific button code:

```typescript
import { requirePermission } from '@/lib/rbac/check';
import { PERMISSIONS } from '@/lib/rbac/permissions';

// In a route handler:
const { session, tenantId } = await requirePermission(PERMISSIONS.USER_READ);
// tenantId = master account id — use for data queries
```

This:
1. Validates session exists (401 if not)
2. If master account (`ownerId === null`) — short-circuits, all permissions granted
3. If sub-account — resolves `user.roleId → role.permissions`, checks the required code (403 if missing)
4. Returns `tenantId` for data isolation

### Business Rules

Hard constraints enforced in API routes:
- Owner role: cannot be deleted or have permissions modified
- Master account: cannot be deleted (guarantees tenant always has a master)
- Cannot change your own role or delete yourself
- Sub-accounts can only be assigned roles belonging to the same tenant
- Roles can only be deleted if no users are assigned to them

### Navigation (Client-Side — UX Only)

Navigation filtering via `useFilteredNavGroups()` in `src/hooks/use-nav.ts`:
- Reads permissions from `/api/auth/me` via `useMe()` hook
- A nav item is shown iff the user holds **≥1** of its menu's button permissions (`menuPermissions(item.access.menu)`)
- If every button under a menu is unchecked, the menu disappears for that role
- **This is UX only** — real security is at the API layer

### Nav Config

In `src/config/nav-config.ts`, gate a menu with `access: { menu: '<menuKey>' }` (the key must match a `PERMISSION_TREE` entry):

```typescript
{
  title: 'Users',
  url: '/dashboard/users',
  icon: 'teams',
  access: { menu: 'users' }
}
```

### Gating a UI button

In a client component, hide a button when the user lacks its code:

```typescript
const { data } = useMe();
const can = (code: string) => (data?.permissions ?? []).includes(code);

{can(PERMISSIONS.USER_CREATE) && <Button>{t('Add User')}</Button>}
```

## Core Files

| File | Purpose |
|------|---------|
| `src/lib/rbac/permissions.ts` | Permission catalog (`PERMISSIONS`, `PERMISSION_TREE`, `ALL_PERMISSIONS`) |
| `src/lib/rbac/check.ts` | `requirePermission()` + error classes |
| `src/hooks/use-me.ts` | React Query hook for `/api/auth/me` |
| `src/hooks/use-nav.ts` | Navigation filtering by menu button permissions |
| `src/config/nav-config.ts` | Navigation items with `access.menu` |
| `src/features/roles/components/role-form-sheet.tsx` | Role create/edit form (permission tree UI) |
| `src/lib/auth-schema.ts` | DB schema (user, role, product tables) |
| `src/lib/auth.ts` | Auth config (no org plugin, with user.create hook) |

## Adding a New Permission

1. Add the code to `src/lib/rbac/permissions.ts` (`PERMISSIONS`) and attach it to the relevant menu in `PERMISSION_TREE` (or add a new menu).
2. Add the code as an i18n key in **both** `translations.en` and `translations.zh` in `src/lib/i18n.ts`.
3. Add `requirePermission(PERMISSIONS.YOUR_CODE)` in the relevant API route.
4. Gate the corresponding UI button with `useMe()` + `permissions.includes(...)`.
5. Master accounts automatically have all permissions (no role assignment needed).

## Data Isolation

All business data is scoped to `ownerId` (the master account's user id). Queries use `where ownerId = tenantId` where `tenantId` is returned by `requirePermission()`. Sub-accounts see data belonging to their master account; different master accounts cannot see each other's data.

## Future Extensions

- **Redis caching**: Cache role→permissions lookup by roleId
- **Row-level isolation**: Add `creator_id` to business tables for "only see own data"
- **Multi-level hierarchy**: Extend `ownerId` to a tree structure
