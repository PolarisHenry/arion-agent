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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Icons } from '@/components/icons';
import { useMutation } from '@tanstack/react-query';
import { createRoleMutation, updateRoleMutation } from '../api/mutations';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { localizeApiError } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { roleKeys } from '../api/queries';
import { PERMISSION_TREE } from '@/lib/rbac/permissions';
import type { Role } from '../api/types';

interface RoleFormSheetProps {
  role?: Role | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RoleFormSheet({ role, open, onOpenChange }: RoleFormSheetProps) {
  const { t } = useTranslation();
  const isEdit = !!role;

  // The parent mounts this sheet fresh on each open, so initialising state from
  // `role` here is correct — no stale-init bug on edit.
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));

  const createMutation = useMutation({
    ...createRoleMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: roleKeys.all });
      toast.success(t('Role created successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const updateMutation = useMutation({
    ...updateRoleMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: roleKeys.all });
      toast.success(t('Role updated successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleMenu = (keys: readonly string[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });

  const handleSubmit = () => {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      description: description.trim(),
      permissions: Array.from(selected)
    };
    if (isEdit && role) {
      updateMutation.mutate({ id: role.id, values: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='gap-0 sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('Edit Role') : t('Create Role')}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? t('Modify role name and permissions.')
              : t('Create a custom role with specific permissions.')}
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 space-y-5 overflow-y-auto px-6 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='role-name'>{t('name')}</Label>
            <Input
              id='role-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('e.g. Editor')}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='role-desc'>{t('description')}</Label>
            <Input
              id='role-desc'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('Optional description')}
            />
          </div>

          <div className='space-y-3'>
            <div>
              <Label>{t('Permissions')}</Label>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('A menu is visible only when at least one of its buttons is enabled.')}
              </p>
            </div>
            {PERMISSION_TREE.map((menu) => {
              const all = menu.permissions.every((p) => selected.has(p));
              const some = menu.permissions.some((p) => selected.has(p));
              return (
                <div key={menu.key} className='rounded-lg border p-3'>
                  <div className='mb-2 flex items-center gap-2'>
                    <Checkbox
                      checked={all}
                      data-state={all ? 'checked' : some ? 'indeterminate' : 'unchecked'}
                      onCheckedChange={() => toggleMenu(menu.permissions)}
                    />
                    <span className='text-sm font-medium'>{t(menu.labelKey)}</span>
                  </div>
                  <div className='grid grid-cols-2 gap-2 pl-6'>
                    {menu.permissions.map((perm) => (
                      <label key={perm} className='flex cursor-pointer items-center gap-2'>
                        <Checkbox
                          checked={selected.has(perm)}
                          onCheckedChange={() => toggle(perm)}
                        />
                        <span className='text-sm'>{t(perm)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <SheetFooter className='flex-row justify-end gap-2 px-6'>
          <Button variant='outline' type='button' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending} disabled={!name.trim()}>
            <Icons.check /> {isEdit ? t('Update') : t('Create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function RoleFormSheetTrigger() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> {t('Create Role')}
      </Button>
      {open && <RoleFormSheet role={null} open={open} onOpenChange={setOpen} />}
    </>
  );
}
