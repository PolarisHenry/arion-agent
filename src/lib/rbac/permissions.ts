// ============================================================
// Permission catalog — button-level, config-driven (model A)
// ------------------------------------------------------------
// Each permission code is a CONCRETE button/operation. It gates both:
//   - a UI button (the button is hidden when the role lacks the code), and
//   - an API route (requirePermission(code) at the top of the handler).
//
// Menus are NOT permissions. A menu is visible for a role iff the role holds
// >=1 of that menu's button permissions — there is no separate "show menu"
// toggle. If every button under a menu is unchecked, the menu disappears.
// ============================================================

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',

  // Product
  PRODUCT_READ: 'product:read',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',

  // User
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_ENABLE: 'user:enable',

  // Role
  ROLE_READ: 'role:read',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',

  // LLM Model
  LLM_MODEL_READ: 'llm_model:read',
  LLM_MODEL_CREATE: 'llm_model:create',
  LLM_MODEL_UPDATE: 'llm_model:update',
  LLM_MODEL_DELETE: 'llm_model:delete',

  // Digital Employee (Agent)
  AGENT_READ: 'agent:read',
  AGENT_CREATE: 'agent:create',
  AGENT_UPDATE: 'agent:update',
  AGENT_DELETE: 'agent:delete',
  AGENT_ENABLE: 'agent:enable',
  AGENT_TRIGGER_MANAGE: 'agent:trigger_manage',
  AGENT_SKILL_MANAGE: 'agent:skill_manage',
  AGENT_LOG_READ: 'agent:log_read'
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Every valid permission code (used to validate role.permissions). */
export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionKey[];

// A menu groups its concrete button permissions. `labelKey` is the i18n key for
// the menu's name; each permission code is itself an i18n key (see i18n.ts).
export type PermissionMenu = {
  key: string;
  labelKey: string;
  permissions: readonly PermissionKey[];
};

export const PERMISSION_TREE: readonly PermissionMenu[] = [
  {
    key: 'dashboard',
    labelKey: 'Dashboard',
    permissions: [PERMISSIONS.DASHBOARD_VIEW]
  },
  {
    key: 'product',
    labelKey: 'Product',
    permissions: [
      PERMISSIONS.PRODUCT_READ,
      PERMISSIONS.PRODUCT_CREATE,
      PERMISSIONS.PRODUCT_UPDATE,
      PERMISSIONS.PRODUCT_DELETE
    ]
  },
  {
    key: 'users',
    labelKey: 'Users',
    permissions: [
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_CREATE,
      PERMISSIONS.USER_UPDATE,
      PERMISSIONS.USER_DELETE,
      PERMISSIONS.USER_ENABLE
    ]
  },
  {
    key: 'roles',
    labelKey: 'Roles',
    permissions: [
      PERMISSIONS.ROLE_READ,
      PERMISSIONS.ROLE_CREATE,
      PERMISSIONS.ROLE_UPDATE,
      PERMISSIONS.ROLE_DELETE
    ]
  },
  {
    key: 'llm-models',
    labelKey: 'LLM Models',
    permissions: [
      PERMISSIONS.LLM_MODEL_READ,
      PERMISSIONS.LLM_MODEL_CREATE,
      PERMISSIONS.LLM_MODEL_UPDATE,
      PERMISSIONS.LLM_MODEL_DELETE
    ]
  },
  {
    key: 'agents',
    labelKey: 'Agents',
    permissions: [
      PERMISSIONS.AGENT_READ,
      PERMISSIONS.AGENT_CREATE,
      PERMISSIONS.AGENT_UPDATE,
      PERMISSIONS.AGENT_DELETE,
      PERMISSIONS.AGENT_ENABLE,
      PERMISSIONS.AGENT_TRIGGER_MANAGE,
      PERMISSIONS.AGENT_SKILL_MANAGE,
      PERMISSIONS.AGENT_LOG_READ
    ]
  }
];

/** All button permission codes that belong to a menu key. */
export function menuPermissions(menuKey: string): readonly PermissionKey[] {
  return PERMISSION_TREE.find((m) => m.key === menuKey)?.permissions ?? [];
}
