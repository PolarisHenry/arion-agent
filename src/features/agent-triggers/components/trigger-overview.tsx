'use client';

import { useState } from 'react';
import { useSuspenseQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';
import { formatDateTimeTz } from '@/lib/format';
import { toast } from 'sonner';
import { localizeApiError } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { allTriggersQueryOptions } from '../api/queries';
import { updateTriggerMutation, deleteTriggerMutation } from '../api/mutations';
import { TriggerFormSheet } from './trigger-form-sheet';
import type { TriggerWithAgent } from '../api/types';

export function TriggerOverview() {
  const { t } = useTranslation();
  const { data: triggers } = useSuspenseQuery(allTriggersQueryOptions());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TriggerWithAgent | null>(null);

  const updateMutation = useMutation({
    ...updateTriggerMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['all-triggers'] });
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const deleteMutation = useMutation({
    ...deleteTriggerMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['all-triggers'] });
      toast.success(t('Trigger deleted successfully'));
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (trigger: TriggerWithAgent) => {
    setEditing(trigger);
    setFormOpen(true);
  };
  const toggleEnabled = (trigger: TriggerWithAgent) => {
    updateMutation.mutate({
      agentId: trigger.agentId,
      triggerId: trigger.id,
      values: { enabled: !trigger.enabled }
    });
  };
  const handleDelete = (trigger: TriggerWithAgent) => {
    if (!window.confirm(t('Delete this trigger?'))) return;
    deleteMutation.mutate({ agentId: trigger.agentId, triggerId: trigger.id });
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Scheduled tasks run the agent automatically at the cron time. Agents can also create these via chat.'
          )}
        </p>
        <Button onClick={openCreate}>
          <Icons.add className='mr-1 h-4 w-4' /> {t('Create Trigger')}
        </Button>
      </div>

      {triggers.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm'>
          {t('No triggers yet. Ask an agent in chat to set one up, or create one here.')}
        </div>
      ) : (
        <div className='space-y-2'>
          {triggers.map((tr) => (
            <div
              key={tr.id}
              className='flex items-center justify-between gap-3 rounded-lg border p-3'
            >
              <div className='min-w-0 flex-1 space-y-1'>
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary' className='text-xs'>
                    {tr.agentName}
                  </Badge>
                  <span className='truncate font-medium'>{tr.name}</span>
                  {!tr.enabled && (
                    <span className='text-muted-foreground text-xs'>({t('Disabled')})</span>
                  )}
                </div>
                <div className='text-muted-foreground flex items-center gap-3 text-xs'>
                  <span className='font-mono'>{tr.cron}</span>
                  {tr.targetChatId && <span className='truncate'>→ {tr.targetChatId}</span>}
                </div>
                <p className='text-muted-foreground truncate text-xs'>{tr.prompt}</p>
                <div className='text-muted-foreground text-xs'>
                  {t('Last Run')}: {tr.lastRunAt ? formatDateTimeTz(tr.lastRunAt) : t('Never')}
                </div>
              </div>
              <div className='flex items-center gap-1'>
                <Checkbox
                  checked={tr.enabled}
                  onCheckedChange={() => toggleEnabled(tr)}
                  aria-label={t('Enabled')}
                />
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => openEdit(tr)}
                  aria-label={t('Edit')}
                >
                  <Icons.edit className='h-4 w-4' />
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => handleDelete(tr)}
                  aria-label={t('Delete')}
                >
                  <Icons.trash className='h-4 w-4' />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <TriggerFormSheet trigger={editing} open={formOpen} onOpenChange={setFormOpen} />
      )}
    </div>
  );
}
