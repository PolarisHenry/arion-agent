'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Icons } from '@/components/icons';
import { useMutation } from '@tanstack/react-query';
import { deleteAgentMutation, toggleAgentStatusMutation } from '../../api/mutations';
import { agentKeys } from '../../api/queries';
import { getQueryClient } from '@/lib/query-client';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { localizeApiError } from '@/lib/api-client';
import { useMe } from '@/hooks/use-me';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import type { Agent } from '../../api/types';
import { AgentFormSheet } from '../agent-form-sheet';

export function CellAction({ data }: { data: Agent }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: me } = useMe();
  const permissions = me?.permissions ?? [];
  const [editOpen, setEditOpen] = useState(false);
  const deleteMutation = useMutation({
    ...deleteAgentMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
      toast.success(t('Agent deleted successfully'));
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });
  const canToggle = permissions.includes(PERMISSIONS.AGENT_ENABLE);
  const toggleMutation = useMutation({
    ...toggleAgentStatusMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
      toast.success(data.status === 'active' ? t('Agent paused') : t('Agent activated'));
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  return (
    <>
      {editOpen && <AgentFormSheet agent={data} open={editOpen} onOpenChange={setEditOpen} />}
      <div className='flex items-center justify-end'>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger render={<Button variant='ghost' className='h-8 w-8 p-0' />}>
            <span className='sr-only'>{t('Open menu')}</span>
            <Icons.ellipsis className='h-4 w-4' />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => router.push(`/dashboard/agents/${data.id}`)}>
              <Icons.eye className='mr-2 h-4 w-4' />
              {t('Detail')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Icons.edit className='mr-2 h-4 w-4' />
              {t('Edit')}
            </DropdownMenuItem>
            {canToggle && (
              <DropdownMenuItem
                onClick={() =>
                  toggleMutation.mutate({
                    id: data.id,
                    status: data.status === 'active' ? ('paused' as const) : ('active' as const)
                  })
                }
              >
                <Icons.circleX className='mr-2 h-4 w-4' />
                {data.status === 'active' ? t('Pause') : t('Activate')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className='text-destructive'
              onClick={() => deleteMutation.mutate(data.id)}
            >
              <Icons.trash className='mr-2 h-4 w-4' />
              {t('Delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
