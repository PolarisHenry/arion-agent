'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSuspenseQuery } from '@tanstack/react-query';
import { agentLogsQueryOptions } from '../../api/log-queries';
import { useTranslation } from '@/lib/i18n';
import { Icons } from '@/components/icons';

import { formatDateTimeTz } from '@/lib/format';

export function AgentLogPanel({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(agentLogsQueryOptions(agentId, { page: 1, limit: 50 }));

  const logs = data?.logs ?? [];

  if (logs.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
        <Icons.info className='mb-3 h-10 w-10' />
        <p className='text-sm'>{t('No logs yet')}</p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      {logs.map((log) => (
        <Card key={log.id} className='overflow-hidden'>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 px-4 py-3'>
            <div className='flex items-center gap-2'>
              <Badge
                variant={
                  log.type === 'message'
                    ? 'default'
                    : log.type === 'trigger'
                      ? 'secondary'
                      : 'outline'
                }
                className='text-xs'
              >
                {log.type}
              </Badge>
              <Badge
                variant={log.status === 'success' ? 'outline' : 'destructive'}
                className='text-xs'
              >
                {log.status}
              </Badge>
              {log.durationMs != null && (
                <span className='text-muted-foreground text-xs'>{log.durationMs}ms</span>
              )}
            </div>
            <span className='text-muted-foreground text-xs'>{formatDateTimeTz(log.createdAt)}</span>
          </CardHeader>
          <CardContent className='px-4 pb-3 pt-0 text-sm space-y-1.5'>
            {log.messageContent && (
              <div>
                <span className='text-muted-foreground font-medium'>In: </span>
                <span className='whitespace-pre-wrap break-words'>
                  {log.messageContent.slice(0, 200)}
                </span>
              </div>
            )}
            {log.responseContent && (
              <div>
                <span className='text-muted-foreground font-medium'>Out: </span>
                <span className='whitespace-pre-wrap break-words'>
                  {log.responseContent.slice(0, 300)}
                </span>
              </div>
            )}
            {log.toolCalls && Array.isArray(log.toolCalls) && log.toolCalls.length > 0 && (
              <div className='flex flex-wrap gap-1 pt-1'>
                {log.toolCalls.map((tc: any, i: number) => (
                  <Badge key={i} variant='outline' className='text-xs'>
                    <Icons.code className='mr-1 h-3 w-3' />
                    {tc.tool}
                  </Badge>
                ))}
              </div>
            )}
            {log.error && <div className='text-destructive text-xs pt-1'>{log.error}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AgentLogPanelSkeleton() {
  return (
    <div className='flex flex-1 animate-pulse flex-col gap-3'>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className='bg-muted h-24 w-full rounded-lg' />
      ))}
    </div>
  );
}
