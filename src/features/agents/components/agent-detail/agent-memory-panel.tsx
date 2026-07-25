'use client';

import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentMemoryQueryOptions } from '../../api/memory-queries';
import { deleteAgentMemory } from '../../api/memory-service';
import { useTranslation } from '@/lib/i18n';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { formatDateTimeTz } from '@/lib/format';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export function AgentMemoryPanel({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(agentMemoryQueryOptions(agentId));
  const memory = data?.memory ?? [];

  const del = useMutation({
    mutationFn: (id: string) => deleteAgentMemory(agentId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-memory', agentId] });
      toast.success(t('Deleted'));
    },
    onError: () => toast.error(t('Delete failed'))
  });

  if (memory.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
        <Icons.info className='mb-3 h-10 w-10' />
        <p className='text-sm'>{t('No memory yet')}</p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {memory.map((m) => (
        <div
          key={m.id}
          className='flex items-start justify-between gap-3 rounded-lg border p-3 text-sm'
        >
          <div className='min-w-0 space-y-1'>
            <div className='flex items-center gap-2'>
              {m.category && <span className='text-muted-foreground text-xs'>[{m.category}]</span>}
              <span className='font-medium'>{m.label ?? m.key}</span>
              {m.importance !== 'medium' && (
                <Badge variant='outline' className='text-xs'>
                  {m.importance}
                </Badge>
              )}
              {m.expiresAt && (
                <span className='text-muted-foreground text-xs'>
                  {t('Expires')} {formatDateTimeTz(m.expiresAt)}
                </span>
              )}
            </div>
            <div className='break-all font-mono text-xs'>{m.value}</div>
            <div className='text-muted-foreground text-xs'>
              {m.key} · {formatDateTimeTz(m.updatedAt)}
            </div>
          </div>
          <Button
            variant='ghost'
            size='icon'
            className='text-muted-foreground hover:text-destructive h-7 w-7 shrink-0'
            onClick={() => del.mutate(m.id)}
            disabled={del.isPending}
            aria-label={t('Delete')}
          >
            <Icons.trash className='h-4 w-4' />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function AgentMemoryPanelSkeleton() {
  return (
    <div className='flex flex-1 animate-pulse flex-col gap-3'>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className='bg-muted h-16 w-full rounded-lg' />
      ))}
    </div>
  );
}
