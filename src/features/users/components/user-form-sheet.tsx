'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Icons } from '@/components/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createUserMutation, updateUserMutation } from '../api/mutations';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useTranslation } from '@/lib/i18n';
import { localizeApiError } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { userKeys } from '../api/queries';
import { rolesQueryOptions } from '@/features/roles/api/queries';
import type { User, UserMutationPayload } from '../api/types';

interface UserFormSheetProps {
  user?: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserFormSheet({ user, open, onOpenChange }: UserFormSheetProps) {
  const { t } = useTranslation();
  const isEdit = !!user;

  // Mounted fresh per open (parent conditionally renders), so initialising from
  // `user` here is safe — no stale-init bug.
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState(user?.roleId ?? '');

  const { data: rolesData } = useQuery({
    ...rolesQueryOptions(),
    enabled: open
  });

  const createMutation = useMutation({
    ...createUserMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: userKeys.all });
      toast.success(t('User added successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const updateMutation = useMutation({
    ...updateUserMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: userKeys.all });
      toast.success(t('User updated successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const handleSubmit = () => {
    if (isEdit) {
      const values: Partial<UserMutationPayload> = {
        name: name.trim(),
        email: email.trim(),
        roleId: selectedRoleId
      };
      if (password) values.password = password;
      updateMutation.mutate({ id: user!.id, values });
      return;
    }
    if (!email || !password || !selectedRoleId) return;
    createMutation.mutate({
      name: name.trim() || email,
      email,
      password,
      roleId: selectedRoleId
    });
  };

  const roles = rolesData?.roles ?? [];
  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSubmit = isEdit
    ? !!email.trim() && !!selectedRoleId
    : !!email.trim() && !!password && !!selectedRoleId;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex flex-col'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('Edit User') : t('Add User')}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? t('Update the user details below.')
              : t('Create a sub-account with a specific role.')}
          </SheetDescription>
        </SheetHeader>

        <div className='mt-4 flex-1 space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='user-name'>{t('Name')}</Label>
            <Input
              id='user-name'
              name='name'
              autoComplete='name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Name')}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='user-email'>{t('Email')}</Label>
            <Input
              id='user-email'
              name='email'
              type='email'
              autoComplete='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('email@example.com')}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='user-password'>{t('Password')}</Label>
            <PasswordInput
              id='user-password'
              name='new-password'
              autoComplete='new-password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? t('Leave blank to keep current') : t('Min 8 characters')}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('Role')}</Label>
            <Select
              value={selectedRoleId}
              onValueChange={(v: string | null) => v && setSelectedRoleId(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('Select role')}>
                  {(value: string | null) =>
                    value ? (roles.find((r: any) => r.id === value)?.name ?? null) : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles.map((role: any) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending} disabled={!canSubmit}>
            <Icons.check /> {isEdit ? t('Update User') : t('Add User')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function UserFormSheetTrigger() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> {t('Add User')}
      </Button>
      {open && <UserFormSheet user={null} open={open} onOpenChange={setOpen} />}
    </>
  );
}
