'use client';

import { useState } from 'react';
import { useSuspenseQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { localizeApiError } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { skillsQueryOptions } from '../api/queries';
import { createSkillMutation, updateSkillMutation, deleteSkillMutation } from '../api/mutations';
import { SkillFormSheet } from './skill-form-sheet';
import { SkillPreviewDialog } from './skill-preview-dialog';
import type { AgentSkill } from '../api/types';

export function AgentSkillPanel({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(skillsQueryOptions(agentId));
  const skills = data ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AgentSkill | null>(null);
  const [previewing, setPreviewing] = useState<AgentSkill | null>(null);

  const createMutation = useMutation({
    ...createSkillMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['agent-skills', agentId] });
      toast.success(t('Skill created successfully'));
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const updateMutation = useMutation({
    ...updateSkillMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['agent-skills', agentId] });
      toast.success(t('Skill updated successfully'));
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const deleteMutation = useMutation({
    ...deleteSkillMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: ['agent-skills', agentId] });
      toast.success(t('Skill deleted successfully'));
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (skill: AgentSkill) => {
    setEditing(skill);
    setFormOpen(true);
  };
  const toggleEnabled = (skill: AgentSkill) => {
    updateMutation.mutate({
      agentId,
      skillId: skill.id,
      values: { enabled: !skill.enabled }
    });
  };
  const handleDelete = (skill: AgentSkill) => {
    if (!window.confirm(t('Delete this skill?'))) return;
    deleteMutation.mutate({ agentId, skillId: skill.id });
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h3 className='font-medium'>{t('Skills')}</h3>
        <Button onClick={openCreate}>
          <Icons.add className='mr-1 h-4 w-4' /> {t('Create Skill')}
        </Button>
      </div>

      {skills.length === 0 ? (
        <div className='flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center'>
          <p className='text-muted-foreground text-sm'>{t('No skills yet')}</p>
          <Button variant='outline' size='sm' onClick={openCreate}>
            <Icons.add className='mr-1 h-4 w-4' /> {t('Create your first skill')}
          </Button>
        </div>
      ) : (
        <div className='space-y-2'>
          {skills.map((skill) => (
            <div
              key={skill.id}
              className='flex items-center justify-between gap-3 rounded-lg border p-3'
            >
              <div className='min-w-0 flex-1 space-y-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='min-w-0 truncate font-medium'>{skill.name}</span>
                  <Badge
                    variant={skill.provenance === 'precipitated' ? 'secondary' : 'outline'}
                    className='text-xs'
                  >
                    {skill.provenance === 'precipitated' ? t('Precipitated') : t('Manual')}
                  </Badge>
                </div>
                {skill.description && (
                  <p className='text-muted-foreground truncate text-xs'>{skill.description}</p>
                )}
              </div>
              <div className='flex shrink-0 items-center gap-1'>
                <Switch
                  checked={skill.enabled}
                  onCheckedChange={() => toggleEnabled(skill)}
                  aria-label={t('Enabled')}
                />
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => setPreviewing(skill)}
                  aria-label={t('Preview')}
                >
                  <Icons.eye className='h-4 w-4' />
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => openEdit(skill)}
                  aria-label={t('Edit Skill')}
                >
                  <Icons.edit className='h-4 w-4' />
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => handleDelete(skill)}
                  aria-label={t('Delete Skill')}
                >
                  <Icons.trash className='h-4 w-4' />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <SkillFormSheet
          agentId={agentId}
          skill={editing}
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      )}

      <SkillPreviewDialog
        skill={previewing}
        onOpenChange={(open) => !open && setPreviewing(null)}
      />
    </div>
  );
}

export function AgentSkillPanelSkeleton() {
  return (
    <div className='flex flex-1 animate-pulse flex-col gap-3'>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className='bg-muted h-16 w-full rounded-lg' />
      ))}
    </div>
  );
}
