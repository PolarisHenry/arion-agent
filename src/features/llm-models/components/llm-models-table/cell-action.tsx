'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Icons } from '@/components/icons';
import { useMutation } from '@tanstack/react-query';
import { deleteLlmModelMutation } from '../../api/mutations';
import { llmModelKeys } from '../../api/queries';
import { getQueryClient } from '@/lib/query-client';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { localizeApiError } from '@/lib/api-client';
import type { LlmModel } from '../../api/types';
import { LlmModelFormSheet } from '../llm-model-form-sheet';

export function CellAction({ data }: { data: LlmModel }) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const deleteMutation = useMutation({
    ...deleteLlmModelMutation,
    onSuccess: () => {
      getQueryClient().invalidateQueries({ queryKey: llmModelKeys.all });
      toast.success(t('LLM model deleted successfully'));
    },
    onError: (err: any) => toast.error(localizeApiError(err?.message, t))
  });

  return (
    <>
      {editOpen && <LlmModelFormSheet model={data} open={editOpen} onOpenChange={setEditOpen} />}
      <div className='flex items-center justify-end'>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger render={<Button variant='ghost' className='h-8 w-8 p-0' />}>
            <span className='sr-only'>{t('Open menu')}</span>
            <Icons.ellipsis className='h-4 w-4' />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Icons.edit className='mr-2 h-4 w-4' />
              {t('Edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className='text-destructive'
              onClick={() => deleteMutation.mutate(data.id)}
            >
              <Icons.trash className='mr-2 h-4 w-4' />
              {t('Delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
