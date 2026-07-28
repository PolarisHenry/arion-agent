'use client';

import { useState } from 'react';
import { useSuspenseQuery, useMutation } from '@tanstack/react-query';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { localizeApiError } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { createTriggerMutation, updateTriggerMutation } from '../api/mutations';
import { agentsQueryOptions } from '@/features/agents/api/queries';
import type { AgentTrigger, TriggerKind, TriggerMutationPayload } from '../api/types';

// Cron presets selectable when the schedule is recurring.
const CRON_PRESETS: { key: string; cron: string }[] = [
  { key: 'Every hour', cron: '0 * * * *' },
  { key: 'Every day at 9am', cron: '0 9 * * *' },
  { key: 'Weekdays 9am', cron: '0 9 * * 1-5' },
  { key: 'Every minute (test)', cron: '* * * * *' }
];

/** Convert an ISO timestamp to the YYYY-MM-DDTHH:mm value a datetime-local
 *  input expects (in the browser's local timezone). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface TriggerFormSheetProps {
  /** Agent to create the trigger under. Required in edit mode (use trigger.agentId);
   *  omit in create mode to let the user pick from a dropdown. */
  agentId?: string;
  trigger?: AgentTrigger | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TriggerFormSheet({ agentId, trigger, open, onOpenChange }: TriggerFormSheetProps) {
  const { t } = useTranslation();
  const isEdit = !!trigger;
  const fixedAgentId = agentId ?? trigger?.agentId; // present in edit mode

  const { data: agentsData } = useSuspenseQuery(agentsQueryOptions({ page: 1, limit: 0 }));
  const agents = agentsData.agents;

  const [selectedAgentId, setSelectedAgentId] = useState(fixedAgentId ?? agents[0]?.id ?? '');
  const [name, setName] = useState(trigger?.name ?? '');
  const [kind, setKind] = useState<TriggerKind>(trigger?.kind ?? 'task');
  // Schedule type is derived from which field the stored trigger uses.
  const [scheduleType, setScheduleType] = useState<'recurring' | 'one-shot'>(
    trigger?.fireAt ? 'one-shot' : 'recurring'
  );
  const [cronExpr, setCronExpr] = useState(trigger?.cron ?? '0 9 * * *');
  const [fireAtInput, setFireAtInput] = useState(isoToLocalInput(trigger?.fireAt ?? null));
  const [prompt, setPrompt] = useState(trigger?.prompt ?? '');
  const [message, setMessage] = useState(trigger?.message ?? '');
  const [targetChatId, setTargetChatId] = useState(trigger?.targetChatId ?? '');
  const [workdaysOnly, setWorkdaysOnly] = useState(trigger?.workdaysOnly ?? false);
  const [enabled, setEnabled] = useState(trigger?.enabled ?? true);

  const createMutation = useMutation({
    ...createTriggerMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['all-triggers'] });
      toast.success(t('Trigger created successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const updateMutation = useMutation({
    ...updateTriggerMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['all-triggers'] });
      toast.success(t('Trigger updated successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const handleSubmit = () => {
    const targetAgentId = isEdit ? trigger!.agentId : selectedAgentId;
    if (!targetAgentId) return;
    const values: TriggerMutationPayload = {
      name: name.trim(),
      kind,
      ...(scheduleType === 'one-shot'
        ? {
            cron: null,
            fireAt: fireAtInput ? new Date(fireAtInput).toISOString() : null
          }
        : { cron: cronExpr.trim(), fireAt: null, workdaysOnly }),
      ...(kind === 'reminder'
        ? { message: message.trim(), prompt: null }
        : { prompt: prompt.trim(), message: null }),
      targetChatId: targetChatId.trim() || null,
      enabled
    };
    if (isEdit && trigger) {
      updateMutation.mutate({ agentId: trigger.agentId, triggerId: trigger.id, values });
    } else {
      createMutation.mutate({ agentId: targetAgentId, values });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const scheduleOk = scheduleType === 'one-shot' ? fireAtInput !== '' : cronExpr.trim() !== '';
  const contentOk = kind === 'reminder' ? message.trim() !== '' : prompt.trim() !== '';
  // A reminder with no recipient has nowhere to go.
  const targetOk = kind === 'task' || targetChatId.trim() !== '';
  const canSubmit =
    (isEdit || selectedAgentId !== '') && name.trim() !== '' && scheduleOk && contentOk && targetOk;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='gap-0 sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('Edit Trigger') : t('Create Trigger')}</SheetTitle>
          <SheetDescription>{t('Create and manage scheduled triggers')}</SheetDescription>
        </SheetHeader>

        <div className='flex-1 space-y-5 overflow-y-auto px-6 py-4'>
          {!isEdit && (
            <div className='space-y-2'>
              <Label htmlFor='trigger-agent'>{t('Agent')}</Label>
              <Select value={selectedAgentId} onValueChange={(v) => setSelectedAgentId(v ?? '')}>
                <SelectTrigger id='trigger-agent'>
                  <SelectValue placeholder={t('Select an agent')} />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='trigger-name'>{t('Trigger Name')}</Label>
            <Input
              id='trigger-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('e.g. Daily summary')}
            />
          </div>

          {/* Kind: reminder (fixed message, no LLM) vs task (agent turn). */}
          <div className='space-y-2'>
            <Label>{t('Kind')}</Label>
            <div className='flex gap-2'>
              {(['task', 'reminder'] as const).map((k) => (
                <Button
                  key={k}
                  type='button'
                  variant={kind === k ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => setKind(k)}
                >
                  {k === 'reminder' ? t('Reminder') : t('Task')}
                </Button>
              ))}
            </div>
            <p className='text-muted-foreground text-xs'>
              {kind === 'reminder'
                ? t('Reminder: send a fixed message at fire time — no LLM runs.')
                : t('Task: run the agent with its tools at fire time.')}
            </p>
          </div>

          {/* Schedule type: recurring (cron) vs one-shot (fireAt datetime). */}
          <div className='space-y-2'>
            <Label>{t('Schedule')}</Label>
            <div className='flex gap-2'>
              {(['recurring', 'one-shot'] as const).map((s) => (
                <Button
                  key={s}
                  type='button'
                  variant={scheduleType === s ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => setScheduleType(s)}
                >
                  {s === 'one-shot' ? t('One-shot') : t('Recurring')}
                </Button>
              ))}
            </div>
          </div>

          {scheduleType === 'recurring' ? (
            <div className='space-y-2'>
              <Label htmlFor='trigger-cron'>{t('Schedule (Cron)')}</Label>
              <Input
                id='trigger-cron'
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder='0 9 * * *'
                className='font-mono'
              />
              <div className='flex flex-wrap gap-2'>
                {CRON_PRESETS.map((p) => (
                  <Button
                    key={p.cron}
                    type='button'
                    variant={cronExpr === p.cron ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => setCronExpr(p.cron)}
                  >
                    {t(p.key)}
                  </Button>
                ))}
              </div>
              <label className='flex cursor-pointer items-center gap-2'>
                <Checkbox
                  checked={workdaysOnly}
                  onCheckedChange={(v) => setWorkdaysOnly(v === true)}
                />
                <span className='text-sm'>{t('Workdays only')}</span>
              </label>
              <p className='text-muted-foreground text-xs'>
                {t('Skip Chinese statutory holidays; 调休 make-up days still fire.')}
              </p>
            </div>
          ) : (
            <div className='space-y-2'>
              <Label htmlFor='trigger-fireat'>{t('Fire At')}</Label>
              <Input
                id='trigger-fireat'
                type='datetime-local'
                value={fireAtInput}
                onChange={(e) => setFireAtInput(e.target.value)}
              />
              <p className='text-muted-foreground text-xs'>
                {t('Fires once at this time, then transitions to completed.')}
              </p>
            </div>
          )}

          {/* Kind-specific content: reminder = message, task = prompt. */}
          {kind === 'reminder' ? (
            <div className='space-y-2'>
              <Label htmlFor='trigger-message'>{t('Message')}</Label>
              <Textarea
                id='trigger-message'
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('The fixed text sent verbatim when this reminder fires')}
              />
            </div>
          ) : (
            <div className='space-y-2'>
              <Label htmlFor='trigger-prompt'>{t('Prompt')}</Label>
              <Textarea
                id='trigger-prompt'
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('The instruction fed to the agent when this task fires')}
              />
              <p className='text-muted-foreground text-xs'>
                {t(
                  'When fired, this prompt runs the agent with its enabled tools; the result is sent to the recipient.'
                )}
              </p>
            </div>
          )}

          <div className='space-y-2'>
            <Label htmlFor='trigger-chat'>{t('Recipient')}</Label>
            <Input
              id='trigger-chat'
              value={targetChatId}
              onChange={(e) => setTargetChatId(e.target.value)}
              placeholder={t('oc_… (chat) / ou_… (user open_id)')}
              className='font-mono'
            />
            <p className='text-muted-foreground text-xs'>
              {kind === 'reminder'
                ? t('Who the reminder is sent to. Required for reminders.')
                : t('Where the task result is sent. Leave blank to run without sending.')}
            </p>
          </div>

          <label className='flex cursor-pointer items-center gap-2'>
            <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
            <span className='text-sm'>{t('Enabled')}</span>
          </label>
        </div>

        <SheetFooter className='flex-row justify-end gap-2 px-6'>
          <Button variant='outline' type='button' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} isLoading={isPending} disabled={!canSubmit}>
            <Icons.check /> {isEdit ? t('Update') : t('Create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
