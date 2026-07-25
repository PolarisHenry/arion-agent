'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getAgentById } from '../../api/service';
import { AgentLogPanel, AgentLogPanelSkeleton } from './agent-log-panel';
import { AgentMemoryPanel, AgentMemoryPanelSkeleton } from './agent-memory-panel';
import { useTranslation } from '@/lib/i18n';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserIdentityPanel } from '@/features/agent-auth/components/user-identity-panel';
import { matchPresetName } from '../../presets';

export function AgentDetailTabs({ agentId }: { agentId: string }) {
  const { t } = useTranslation();

  // Use a simple fetch to get agent detail
  const { data: agent } = useSuspenseQuery({
    queryKey: ['agent-detail', agentId],
    queryFn: () => getAgentById(agentId)
  });

  return (
    <div className='space-y-6'>
      {/* Agent overview card */}
      <Card>
        <CardHeader>
          <CardTitle className='inline-flex items-center gap-2'>
            {agent.name}
            {matchPresetName(agent.systemPrompt) && (
              <Badge variant='secondary' className='text-xs'>
                {matchPresetName(agent.systemPrompt)}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 gap-4 text-sm'>
            <div>
              <span className='text-muted-foreground'>{t('Persona')}: </span>
              <span>{matchPresetName(agent.systemPrompt) || t('Custom')}</span>
            </div>
            <div>
              <span className='text-muted-foreground'>{t('App ID')}: </span>
              <span className='font-mono'>{agent.appId}</span>
            </div>
            <div>
              <span className='text-muted-foreground'>{t('Status')}: </span>
              <Badge
                variant={agent.status === 'active' ? 'default' : 'secondary'}
                className='text-xs'
              >
                {agent.status === 'active' ? t('active') : t('paused')}
              </Badge>
            </div>
            <div>
              <span className='text-muted-foreground'>{t('Bound LLM')}: </span>
              <span>{agent.llmModelName ?? t('No LLM model')}</span>
            </div>
            <div>
              <span className='text-muted-foreground'>Config v: </span>
              <span>{agent.configVersion}</span>
            </div>
            {agent.description && (
              <div className='col-span-2'>
                <span className='text-muted-foreground'>{t('description')}: </span>
                <span>{agent.description}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User identity panel */}
      <Suspense fallback={<div className='bg-muted h-32 w-full animate-pulse rounded-lg' />}>
        <UserIdentityPanel agentId={agentId} />
      </Suspense>

      {/* Tabs: Overview / Logs */}
      <Tabs defaultValue='logs'>
        <TabsList>
          <TabsTrigger value='overview'>{t('Dashboard')}</TabsTrigger>
          <TabsTrigger value='logs'>{t('Logs')}</TabsTrigger>
          <TabsTrigger value='memory'>{t('Memory')}</TabsTrigger>
        </TabsList>
        <TabsContent value='overview' className='pt-4'>
          <div className='space-y-3 text-sm'>
            <div>
              <span className='text-muted-foreground font-medium'>{t('System Prompt')}:</span>
              <pre className='bg-muted mt-1 max-h-48 overflow-y-auto rounded p-3 text-xs whitespace-pre-wrap'>
                {agent.systemPrompt}
              </pre>
            </div>
          </div>
        </TabsContent>
        <TabsContent value='logs' className='pt-4'>
          <Suspense fallback={<AgentLogPanelSkeleton />}>
            <AgentLogPanel agentId={agentId} />
          </Suspense>
        </TabsContent>
        <TabsContent value='memory' className='pt-4'>
          <Suspense fallback={<AgentMemoryPanelSkeleton />}>
            <AgentMemoryPanel agentId={agentId} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function AgentDetailTabsSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='bg-muted h-36 w-full animate-pulse rounded-lg' />
      <div className='bg-muted h-96 w-full animate-pulse rounded-lg' />
    </div>
  );
}
