export type User = {
  id: string;
  name: string;
  email: string;
  ownerId: string | null;
  roleId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserFilters = {
  page?: number;
  limit?: number;
  roles?: string;
  search?: string;
  sort?: string;
};

export type UsersResponse = {
  success: boolean;
  time: string;
  message: string;
  total_users: number;
  offset: number;
  limit: number;
  users: User[];
};

export type UserMutationPayload = {
  name: string;
  email: string;
  password?: string;
  roleId?: string;
};
