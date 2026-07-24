import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { createRole, updateRole, deleteRole } from './service';
import { roleKeys } from './queries';
import type { RoleMutationPayload } from './types';

export const createRoleMutation = mutationOptions({
  mutationFn: (data: RoleMutationPayload) => createRole(data),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: roleKeys.all });
  }
});

export const updateRoleMutation = mutationOptions({
  mutationFn: ({ id, values }: { id: string; values: Partial<RoleMutationPayload> }) =>
    updateRole(id, values),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: roleKeys.all });
  }
});

export const deleteRoleMutation = mutationOptions({
  mutationFn: (id: string) => deleteRole(id),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: roleKeys.all });
  }
});
