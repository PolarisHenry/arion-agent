export type Role = {
  id: string;
  ownerId: string | null;
  name: string;
  description: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type RoleFilters = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
};

export type RolesResponse = {
  success: boolean;
  total_roles: number;
  offset: number;
  limit: number;
  roles: Role[];
};

export type RoleMutationPayload = {
  name: string;
  description?: string;
  permissions: string[];
};
