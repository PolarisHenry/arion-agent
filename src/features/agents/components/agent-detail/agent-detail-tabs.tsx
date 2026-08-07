'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getAgentById } from '../../api/service';
import { agentKeys } from '../../api/queries';
import { getQueryClient } from '@/lib/query-client';
import { AgentLogPanel, AgentLogPanelSkeleton } from './agent-log-panel';
import { AgentMemoryPanel, AgentMemoryPanelSkeleton } from './agent-memory-panel';
import {
  AgentSkillPanel,
  AgentSkillPanelSkeleton
} from '@/features/agent-skills/components/agent-skill-panel';
import { useTranslation } from '@/lib/i18n';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserIdentityPanel } from '@/features/agent-auth/components/user-identity-panel';
import { WeChatLoginWidget } from '../wechat-login-widget';
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
            {agent.platform !== 'wechat' && (
              <div>
                <span className='text-muted-foreground'>{t('App ID')}: </span>
                <span className='font-mono'>{agent.appId}</span>
              </div>
            )}
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

      {/* Identity panel — Feishu agents show user-OAuth status; WeChat agents
          show a re-scan card (their identity is the QR scan, refreshed here
          when the session expires / -14). This is the only re-scan entry point. */}
      {agent.platform === 'wechat' ? (
        <Card>
          <CardHeader>
            <CardTitle className='inline-flex items-center gap-2'>
              {t('WeChat account')}
              {agent.platformConfig?.needsReauth && (
                <Badge variant='destructive' className='text-xs'>
                  {t('Re-scan required')}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {agent.platformConfig?.needsReauth && (
              <div className='rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300'>
                ⚠️ {t('WeChat session expired — re-scan required')}
              </div>
            )}
            <WeChatLoginWidget
              mode='reauth'
              agentId={agentId}
              onConfirmed={() => {
                getQueryClient().invalidateQueries({ queryKey: ['agent-detail', agentId] });
                getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Suspense fallback={<div className='bg-muted h-32 w-full animate-pulse rounded-lg' />}>
          <UserIdentityPanel agentId={agentId} />
        </Suspense>
      )}

      {/* Tabs: Overview / Logs */}
      <Tabs defaultValue='logs'>
        <TabsList>
          <TabsTrigger value='overview'>{t('Dashboard')}</TabsTrigger>
          <TabsTrigger value='logs'>{t('Logs')}</TabsTrigger>
          <TabsTrigger value='memory'>{t('Memory')}</TabsTrigger>
          <TabsTrigger value='skills'>{t('Skills')}</TabsTrigger>
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
        <TabsContent value='skills' className='pt-4'>
          <Suspense fallback={<AgentSkillPanelSkeleton />}>
            <AgentSkillPanel agentId={agentId} />
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
