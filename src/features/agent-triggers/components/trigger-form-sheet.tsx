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
import type { AgentTrigger, TriggerMutationPayload } from '../api/types';

// Cron presets selectable in the form.
const CRON_PRESETS: { key: string; cron: string }[] = [
  { key: 'Every hour', cron: '0 * * * *' },
  { key: 'Every day at 9am', cron: '0 9 * * *' },
  { key: 'Weekdays 9am', cron: '0 9 * * 1-5' },
  { key: 'Every minute (test)', cron: '* * * * *' }
];

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
  const [cronExpr, setCronExpr] = useState(trigger?.cron ?? '0 9 * * *');
  const [prompt, setPrompt] = useState(trigger?.prompt ?? '');
  const [targetChatId, setTargetChatId] = useState(trigger?.targetChatId ?? '');
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
      cron: cronExpr.trim(),
      prompt: prompt.trim(),
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
  const canSubmit =
    (isEdit || selectedAgentId !== '') &&
    name.trim() !== '' &&
    cronExpr.trim() !== '' &&
    prompt.trim() !== '';

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
            <p className='text-muted-foreground text-xs'>
              {t('5-field standard cron (min hour day month weekday)')}
            </p>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='trigger-prompt'>{t('Prompt')}</Label>
            <Textarea
              id='trigger-prompt'
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('The message sent to the agent when this trigger fires')}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'When fired, this prompt runs the agent with its enabled tools; the result is sent to the target chat.'
              )}
            </p>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='trigger-chat'>{t('Target Chat ID')}</Label>
            <Input
              id='trigger-chat'
              value={targetChatId}
              onChange={(e) => setTargetChatId(e.target.value)}
              placeholder={t('oc_... (leave blank to skip sending)')}
              className='font-mono'
            />
            <p className='text-muted-foreground text-xs'>
              {t('Leave blank to run the agent without sending the result')}
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
