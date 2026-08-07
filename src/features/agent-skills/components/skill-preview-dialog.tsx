'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n';
import type { AgentSkill } from '../api/types';

interface SkillPreviewDialogProps {
  skill: AgentSkill | null;
  onOpenChange: (open: boolean) => void;
}

/** Read-only view of a skill's body. Rendered inline by AgentSkillPanel. */
export function SkillPreviewDialog({ skill, onOpenChange }: SkillPreviewDialogProps) {
  const { t } = useTranslation();
  const open = skill !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <span className='font-medium'>{skill?.name ?? ''}</span>
            {skill && (
              <Badge
                variant={skill.provenance === 'precipitated' ? 'secondary' : 'outline'}
                className='text-xs'
              >
                {skill.provenance === 'precipitated' ? t('Precipitated') : t('Manual')}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{skill?.description ?? ''}</DialogDescription>
        </DialogHeader>
        <ScrollArea className='max-h-[60vh]'>
          <pre className='whitespace-pre-wrap break-words p-1 font-mono text-sm'>
            {skill?.body ?? ''}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
