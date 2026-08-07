'use client';

import { useMutation } from '@tanstack/react-query';
import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { localizeApiError } from '@/lib/api-client';
import { createSkillMutation, updateSkillMutation } from '../api/mutations';
import { skillSchema, type SkillFormValues } from '../schemas/skill';
import type { AgentSkill } from '../api/types';

interface SkillFormSheetProps {
  agentId: string;
  skill?: AgentSkill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create/edit a skill. Uses useAppForm + useFormFields (CLAUDE.md mandate).
 *  The submit button lives in SheetFooter, bridged to the form via form='skill-form-id'. */
export function SkillFormSheet({ agentId, skill, open, onOpenChange }: SkillFormSheetProps) {
  const { t } = useTranslation();
  const isEdit = !!skill;

  const createMutation = useMutation({
    ...createSkillMutation,
    onSuccess: () => {
      toast.success(t('Skill created successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const updateMutation = useMutation({
    ...updateSkillMutation,
    onSuccess: () => {
      toast.success(t('Skill updated successfully'));
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const form = useAppForm({
    defaultValues: {
      name: skill?.name ?? '',
      description: skill?.description ?? '',
      body: skill?.body ?? '',
      enabled: skill?.enabled ?? true
    } as SkillFormValues,
    validators: {
      onSubmit: skillSchema
    },
    onSubmit: ({ value }) => {
      if (isEdit && skill) {
        updateMutation.mutate({ agentId, skillId: skill.id, values: value });
      } else {
        createMutation.mutate({ agentId, values: value });
      }
    }
  });

  const { FormTextField, FormTextareaField, FormSwitchField } = useFormFields<SkillFormValues>();
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='gap-0 sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>{isEdit ? t('Edit Skill') : t('Create Skill')}</SheetTitle>
          <SheetDescription>{t('Skill management')}</SheetDescription>
        </SheetHeader>

        <form.AppForm>
          <form.Form id='skill-form-id' className='flex-1 space-y-4 overflow-y-auto px-6 py-4'>
            <FormTextField name='name' label={t('Skill Name')} required />
            <FormTextField
              name='description'
              label={t('Trigger cue — what makes the agent reach for this skill')}
              required
            />
            <FormTextareaField name='body' label={t('Skill Body')} required rows={8} />
            <FormSwitchField name='enabled' label={t('Enabled')} />
          </form.Form>
        </form.AppForm>

        <SheetFooter className='flex-row justify-end gap-2 px-6'>
          <Button variant='outline' type='button' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button type='submit' form='skill-form-id' isLoading={isPending}>
            {isEdit ? t('Update') : t('Create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
