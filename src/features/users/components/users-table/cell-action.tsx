'use client';
import { AlertModal } from '@/components/modal/alert-modal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { deleteUserMutation, toggleUserEnabledMutation } from '../../api/mutations';
import type { User } from '../../api/types';
import { UserFormSheet } from '../user-form-sheet';
import { Icons } from '@/components/icons';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { localizeApiError } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { userKeys } from '../../api/queries';
import { useSession } from '@/lib/auth-client';

interface CellActionProps {
  data: User;
}

export function CellAction({ data }: CellActionProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { t } = useTranslation();
  const { data: session } = useSession();

  const isSelf = session?.user?.id === data.id;
  const isEnabled = data.enabled !== false;

  const deleteMutation = useMutation({
    ...deleteUserMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: userKeys.all });
      toast.success(t('User removed successfully'));
      setDeleteOpen(false);
    },
    onError: (err: any) => {
      toast.error(localizeApiError(err?.message, t));
    }
  });

  const toggleMutation = useMutation({
    ...toggleUserEnabledMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: userKeys.all });
      toast.success(isEnabled ? t('User disabled') : t('User enabled'));
    },
    onError: (err: any) => {
      toast.error(localizeApiError(err?.message, t));
    }
  });

  return (
    <>
      <AlertModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate(data.id)}
        loading={deleteMutation.isPending}
      />
      {editOpen && <UserFormSheet user={data} open={editOpen} onOpenChange={setEditOpen} />}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={<Button variant='ghost' className='h-8 w-8 p-0' />}>
          <span className='sr-only'>{t('Open menu')}</span>
          <Icons.ellipsis className='h-4 w-4' />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('Actions')}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Icons.edit className='mr-2 h-4 w-4' />
            {t('Edit User')}
          </DropdownMenuItem>
          {!isSelf && (
            <DropdownMenuItem
              onClick={() => toggleMutation.mutate({ id: data.id, enabled: !isEnabled })}
            >
              {isEnabled ? (
                <>
                  <Icons.circleX className='mr-2 h-4 w-4' />
                  {t('Disable')}
                </>
              ) : (
                <>
                  <Icons.circleCheck className='mr-2 h-4 w-4' />
                  {t('Enable')}
                </>
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDeleteOpen(true)}>
            <Icons.trash className='mr-2 h-4 w-4' />
            {t('Remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
