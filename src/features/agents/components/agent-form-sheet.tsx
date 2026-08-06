'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Icons } from '@/components/icons';
import { useMutation } from '@tanstack/react-query';
import { createAgentMutation, updateAgentMutation } from '../api/mutations';
import { llmModelsQueryOptions } from '@/features/llm-models/api/queries';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { localizeApiError } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { agentKeys, agentsQueryOptions } from '../api/queries';
import { type Agent, type AgentMutationPayload } from '../api/types';
import {
  startRegisterApp,
  pollRegisterApp,
  cancelRegisterApp,
  fetchAppInfo,
  type RegisterAppPollResponse
} from '../api/service';
import {
  AGENT_PRESETS,
  DEFAULT_PRESET_ID,
  matchPresetId,
  personalizePresetPrompt
} from '../presets';
import { WeChatLoginWidget } from './wechat-login-widget';

// ============================================================
// One-click app creation sub-component
// ============================================================

type AppCreationState =
  | { phase: 'idle' }
  | { phase: 'creating' }
  | { phase: 'ready'; verificationUrl: string; flowId: string; expireIn: number }
  | { phase: 'polling'; verificationUrl: string; flowId: string }
  | { phase: 'completed'; appId: string; appSecret: string }
  | { phase: 'error'; error: string; verificationUrl?: string; flowId?: string };

interface AppCreationFlowProps {
  state: AppCreationState;
  onStart: () => void;
  onCancel: () => void;
  onRecreate: () => void;
}

function AppCreationFlow({ state, onStart, onCancel, onRecreate }: AppCreationFlowProps) {
  const { t } = useTranslation();

  // Idle → "One-click Create" button
  if (state.phase === 'idle' || state.phase === 'creating') {
    return (
      <Button
        type='button'
        variant='outline'
        className='w-full'
        onClick={onStart}
        isLoading={state.phase === 'creating'}
      >
        {state.phase === 'creating' ? t('Creating...') : t('One-click Create')}
      </Button>
    );
  }

  // QR code display + polling
  if (state.phase === 'ready' || state.phase === 'polling') {
    return (
      <div className='flex flex-col items-center gap-3 rounded-lg border p-4'>
        <p className='text-muted-foreground text-center text-sm'>
          {t('Open the link or scan the QR code in Feishu/Lark to create the app.')}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- QR served from a dynamic local API endpoint; next/image optimization would blur the scannable code */}
        <img
          src={`/api/agents/register-app/qr?url=${encodeURIComponent(state.verificationUrl)}`}
          alt='QR Code'
          className='h-48 w-48 rounded-lg border'
        />
        <a
          href={state.verificationUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='text-primary break-all text-center text-xs underline'
        >
          {state.verificationUrl}
        </a>
        {state.phase === 'polling' && (
          <p className='text-muted-foreground flex items-center gap-1 text-xs'>
            <span className='inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400' />
            {t('Waiting for authorization...')}
          </p>
        )}
        <div className='flex gap-2'>
          <Button type='button' variant='ghost' size='sm' onClick={onCancel}>
            {t('Cancel Register')}
          </Button>
        </div>
      </div>
    );
  }

  // Completed — credentials obtained
  if (state.phase === 'completed') {
    return (
      <div className='flex flex-col items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950'>
        <p className='text-sm font-medium text-green-700 dark:text-green-400'>
          ✅ {t('App credentials obtained')}
        </p>
        <p className='text-muted-foreground text-xs'>App ID: {state.appId}</p>
      </div>
    );
  }

  // Error / expired / denied
  if (state.phase === 'error') {
    const isExpired = state.error.includes('expired');
    const isDenied = state.error.includes('access_denied');
    const label = isExpired
      ? t('QR Code expired')
      : isDenied
        ? t('Access Denied')
        : t('Failed to create app');

    return (
      <div className='flex flex-col items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950'>
        <p className='text-sm font-medium text-red-700 dark:text-red-400'>❌ {label}</p>
        <Button type='button' variant='outline' size='sm' onClick={onRecreate}>
          {t('Re-create')}
        </Button>
      </div>
    );
  }

  return null;
}

// ============================================================
// Main form component
// ============================================================

interface AgentFormSheetProps {
  agent?: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CredentialMode = 'create-new' | 'add-existing';

export function AgentFormSheet({ agent, open, onOpenChange }: AgentFormSheetProps) {
  const { t } = useTranslation();
  const isEdit = !!agent;

  const { data: llmData } = useSuspenseQuery(llmModelsQueryOptions({ page: 1, limit: 0 }));
  const { data: agentsData } = useSuspenseQuery(agentsQueryOptions({ limit: 0 }));
  const larkAgents = agentsData.agents.filter((a) => a.platform === 'lark');

  const [name, setName] = useState(agent?.name ?? '');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [credentialMode, setCredentialMode] = useState<CredentialMode>(
    isEdit ? 'add-existing' : 'create-new'
  );
  const [appId, setAppId] = useState(agent?.appId ?? '');
  const [appSecret, setAppSecret] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(() => {
    // Edit: restore the agent's own prompt.
    // Create: pre-fill the default preset (secretary) so the form is immediately
    // usable — mirrors what happens when a user manually picks that preset.
    if (agent) return agent.systemPrompt;
    const preset = AGENT_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
    return preset?.systemPrompt ?? '';
  });
  const [llmModelId, setLlmModelId] = useState(agent?.llmModelId ?? '');
  const [platform, setPlatform] = useState<'lark' | 'wechat'>(agent?.platform ?? 'lark');
  const [linkedAgentId, setLinkedAgentId] = useState<string>(agent?.linkedAgentId ?? '');
  // One-click app creation state
  const [creationState, setCreationState] = useState<AppCreationState>({ phase: 'idle' });
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track auto-fetched app info to avoid overwriting user edits
  const lastFetchedAppId = useRef<string>('');
  const [appInfoError, setAppInfoError] = useState<string>('');
  const [appInfoSuccess, setAppInfoSuccess] = useState<string>('');
  const [credentialValid, setCredentialValid] = useState<boolean | null>(null); // null = not checked yet
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() =>
    agent ? matchPresetId(agent.systemPrompt) : DEFAULT_PRESET_ID
  );

  // Auto-fetch app info when appId + appSecret are both filled in add-existing mode
  useEffect(() => {
    if (credentialMode !== 'add-existing') {
      setAppInfoError('');
      setAppInfoSuccess('');
      setCredentialValid(null);
      return;
    }
    if (!appId.trim() || !appSecret.trim()) {
      setAppInfoError('');
      setAppInfoSuccess('');
      setCredentialValid(null);
      return;
    }
    if (appId.trim() === lastFetchedAppId.current) return;

    const trimmedAppId = appId.trim();
    lastFetchedAppId.current = trimmedAppId;
    setAppInfoError('');
    setAppInfoSuccess('');
    setCredentialValid(null);

    const trimmedSecret = appSecret.trim();
    let cancelled = false;
    fetchAppInfo(trimmedAppId, trimmedSecret)
      .then((info) => {
        if (cancelled) return;
        setCredentialValid(true);
        // Only pre-fill if user hasn't manually edited the name
        if (!name.trim()) {
          setName(info.appName);
        }
        if (info.appName) {
          setAppInfoSuccess(`已获取应用：${info.appName}`);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setCredentialValid(false);
        setAppInfoError(err?.message || 'Unable to verify credentials');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentialMode, appId, appSecret]);

  // Reset credential validation when switching mode or changing inputs
  const handleCredentialChange = useCallback(
    (field: 'id' | 'secret', value: string) => {
      if (field === 'id') setAppId(value);
      else setAppSecret(value);
      if (lastFetchedAppId.current !== appId.trim()) {
        setCredentialValid(null);
        setAppInfoError('');
        setAppInfoSuccess('');
      }
    },
    [appId]
  );
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // When creation completes, auto-fill appId
  useEffect(() => {
    if (creationState.phase === 'completed') {
      setAppId(creationState.appId);
      setAppSecret(creationState.appSecret);
    }
  }, [creationState.phase]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const handleStartCreation = useCallback(async () => {
    setCreationState({ phase: 'creating' });
    try {
      const res = await startRegisterApp({
        appName: name.trim() || undefined,
        appDesc: description.trim() || undefined
      });
      setCreationState({
        phase: 'ready',
        verificationUrl: res.verificationUrl,
        flowId: res.flowId,
        expireIn: res.expireIn
      });
      // Auto-start polling after a short delay
      setTimeout(() => {
        setCreationState((prev) => {
          if (prev.phase === 'ready') {
            return { phase: 'polling', verificationUrl: prev.verificationUrl, flowId: prev.flowId };
          }
          return prev;
        });
        // Start the actual poll interval
        pollTimerRef.current = setInterval(async () => {
          setCreationState((prev) => {
            if (prev.phase !== 'ready' && prev.phase !== 'polling') return prev;
            const flowId = prev.flowId;
            pollRegisterApp(flowId)
              .then((result: RegisterAppPollResponse) => {
                setCreationState((current) => {
                  if ('flowId' in current && current.flowId !== flowId) return current;
                  switch (result.status) {
                    case 'completed':
                      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                      return {
                        phase: 'completed',
                        appId: result.appId!,
                        appSecret: result.appSecret!
                      };
                    case 'error':
                    case 'expired':
                    case 'access_denied':
                      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                      const prevUrl =
                        'verificationUrl' in current ? current.verificationUrl : undefined;
                      const prevFlow = 'flowId' in current ? current.flowId : undefined;
                      return {
                        phase: 'error',
                        error: result.error || result.status,
                        verificationUrl: prevUrl,
                        flowId: prevFlow
                      };
                    default:
                      return current;
                  }
                });
              })
              .catch(() => {
                // Silently retry next interval
              });
            return prev;
          });
        }, 3000);
      }, 2000);
    } catch (err: any) {
      setCreationState({ phase: 'error', error: err?.message || 'Failed' });
    }
  }, [name, description]);

  const handleCancelCreation = useCallback(async () => {
    stopPolling();
    if ('flowId' in creationState && creationState.flowId) {
      await cancelRegisterApp(creationState.flowId).catch(() => {});
    }
    setCreationState({ phase: 'idle' });
  }, [creationState, stopPolling]);

  const handleRecreate = useCallback(() => {
    stopPolling();
    setCreationState({ phase: 'idle' });
  }, [stopPolling]);

  const createMutation = useMutation({
    ...createAgentMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
      toast.success(t('Agent created successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });
  const updateMutation = useMutation({
    ...updateAgentMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
      toast.success(t('Agent updated successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const handleSubmit = () => {
    if (!name.trim() || !systemPrompt.trim() || !llmModelId) return;
    if (platform === 'lark' && !appId.trim()) return;
    const base: AgentMutationPayload = {
      name: name.trim(),
      description: description.trim() || undefined,
      systemPrompt: systemPrompt.trim(),
      llmModelId,
      status: 'active'
    };
    if (platform === 'lark') base.appId = appId.trim();
    if (platform === 'wechat') base.linkedAgentId = linkedAgentId.trim() || null;
    if (isEdit && agent) {
      const values: Partial<AgentMutationPayload> = { ...base };
      if (platform === 'lark' && appSecret.trim()) values.appSecret = appSecret.trim();
      updateMutation.mutate({ id: agent.id, values });
    } else {
      // Create — Lark only (WeChat create goes through the scan widget).
      if (!appSecret.trim()) return;
      createMutation.mutate({ ...base, appSecret: appSecret.trim() });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSubmit =
    name.trim() !== '' &&
    systemPrompt.trim() !== '' &&
    !!llmModelId &&
    (platform === 'wechat' ? true : appId.trim() !== '' && (isEdit || appSecret.trim() !== ''));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='gap-0 sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('Edit Agent') : t('Create Agent')}</SheetTitle>
          <SheetDescription>{t('Manage digital employees')}</SheetDescription>
        </SheetHeader>

        <div className='flex-1 space-y-5 overflow-y-auto px-6 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='agent-name'>{t('name')}</Label>
            <Input
              id='agent-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('e.g. Support Assistant')}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='agent-desc'>{t('description')}</Label>
            <Input
              id='agent-desc'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Platform — Lark (Feishu) or WeChat (iLink) */}
          <div className='space-y-2'>
            <Label>{t('Platform')}</Label>
            <Select
              value={platform}
              onValueChange={(v) => setPlatform((v ?? 'lark') as 'lark' | 'wechat')}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v) => (v === 'wechat' ? t('WeChat') : t('Lark / Feishu'))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='lark'>{t('Lark / Feishu')}</SelectItem>
                <SelectItem value='wechat'>{t('WeChat')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Credentials — Lark only (appId/secret or one-click create) */}
          {platform === 'lark' && (
            <div className='space-y-3'>
              <div className='space-y-2'>
                <Label>{t('App Credential Mode')}</Label>
                <Select
                  value={credentialMode}
                  onValueChange={(v) => {
                    setCredentialMode(v as CredentialMode);
                    if (v === 'create-new') {
                      setAppId('');
                      setAppSecret('');
                      setCreationState({ phase: 'idle' });
                    }
                  }}
                  disabled={isEdit}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(value) =>
                        value === 'create-new' ? t('Create New App') : t('Add Existing App')
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='create-new'>{t('Create New App')}</SelectItem>
                    <SelectItem value='add-existing'>{t('Add Existing App')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {credentialMode === 'create-new' && !isEdit && (
                <AppCreationFlow
                  state={creationState}
                  onStart={handleStartCreation}
                  onCancel={handleCancelCreation}
                  onRecreate={handleRecreate}
                />
              )}

              {credentialMode === 'create-new' && creationState.phase === 'completed' && (
                <div className='space-y-2'>
                  <Label htmlFor='agent-appid'>{t('App ID')}</Label>
                  <Input id='agent-appid' value={appId} disabled className='bg-muted' />
                </div>
              )}

              {credentialMode === 'add-existing' && (
                <>
                  <div className='space-y-2'>
                    <Label htmlFor='agent-appid'>{t('App ID')}</Label>
                    <Input
                      id='agent-appid'
                      value={appId}
                      onChange={(e) => handleCredentialChange('id', e.target.value)}
                      placeholder={t('Feishu app id (cli_xxx)')}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='agent-appsecret'>{t('App Secret')}</Label>
                    <Input
                      id='agent-appsecret'
                      type='password'
                      value={appSecret}
                      onChange={(e) => handleCredentialChange('secret', e.target.value)}
                      placeholder={isEdit ? agent?.appSecretMasked : ''}
                    />
                    {appInfoSuccess && <p className='text-xs text-green-600'>{appInfoSuccess}</p>}
                    {appInfoError && <p className='text-xs text-red-500'>{appInfoError}</p>}
                    {credentialValid === false && (
                      <p className='text-xs text-red-500'>
                        {t('App credentials are invalid, please check')}
                      </p>
                    )}
                    {isEdit && (
                      <p className='text-muted-foreground text-xs'>
                        {t('Leave blank to keep current key')}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* WeChat — optional Feishu link (create + edit) + scan-to-create (create only) */}
          {platform === 'wechat' && (
            <div className='space-y-4'>
              <div className='space-y-2'>
                <Label>{t('Link Feishu agent')}</Label>
                <Select
                  value={linkedAgentId || '__none__'}
                  onValueChange={(v) => setLinkedAgentId(v === '__none__' ? '' : (v ?? ''))}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v) =>
                        !v || v === '__none__'
                          ? t('No Feishu link')
                          : (larkAgents.find((a) => a.id === v)?.name ?? v)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='__none__'>{t('No Feishu link')}</SelectItem>
                    {larkAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Link to reuse a Feishu agent appId/secret and user authorization — reads the same Feishu knowledge base. Persona and memory stay independent.'
                  )}
                </p>
              </div>
              {!isEdit && (
                <WeChatLoginWidget
                  payload={{
                    name,
                    systemPrompt,
                    llmModelId,
                    description,
                    linkedAgentId: linkedAgentId || undefined
                  }}
                  onConfirmed={() => {
                    getQueryClient().invalidateQueries({ queryKey: agentKeys.all });
                    onOpenChange(false);
                  }}
                />
              )}
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='agent-llm'>{t('Bound LLM')}</Label>
            <Select value={llmModelId} onValueChange={(v) => setLlmModelId(v ?? '')}>
              <SelectTrigger id='agent-llm'>
                <SelectValue placeholder={t('Select an LLM model')}>
                  {(value) => {
                    const model = llmData.models.find((m) => m.id === value);
                    return model ? `${model.name} (${model.modelName})` : value;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {llmData.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.modelName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='agent-prompt'>{t('System Prompt')}</Label>
            <div className='space-y-3'>
              <div className='space-y-1.5'>
                <Select
                  value={selectedPresetId}
                  onValueChange={(v) => {
                    setSelectedPresetId(v ?? '');
                    const preset = AGENT_PRESETS.find((p) => p.id === v);
                    if (preset) {
                      setSystemPrompt(personalizePresetPrompt(preset.systemPrompt, name));
                    }
                  }}
                >
                  <SelectTrigger id='agent-preset'>
                    <SelectValue placeholder={t('Select a role preset...')}>
                      {(value) => {
                        if (!value) return value;
                        const preset = AGENT_PRESETS.find((p) => p.id === value);
                        return preset ? preset.name : value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        <span className='font-medium'>{preset.name}</span>
                        <span className='text-muted-foreground'> — {preset.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPresetId && (
                  <p className='text-muted-foreground text-xs'>
                    {t('Prompt and tools filled from preset. You can edit them freely.')}
                  </p>
                )}
              </div>
              <Textarea
                id='agent-prompt'
                rows={6}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={t('Persona / role instructions')}
              />
            </div>
          </div>
        </div>

        <SheetFooter className='flex-row justify-end gap-2 px-6'>
          <Button variant='outline' type='button' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          {(platform === 'lark' || isEdit) && (
            <Button onClick={handleSubmit} isLoading={isPending} disabled={!canSubmit}>
              <Icons.check /> {isEdit ? t('Update') : t('Create')}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function AgentFormSheetTrigger() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className='mr-2 h-4 w-4' /> {t('Create Agent')}
      </Button>
      {open && <AgentFormSheet agent={null} open={open} onOpenChange={setOpen} />}
    </>
  );
}
