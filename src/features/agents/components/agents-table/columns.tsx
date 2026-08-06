'use client';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';
import type { Agent } from '../../api/types';
import { CellAction } from './cell-action';
import { AgentAuthCell } from '@/features/agent-auth/components/agent-auth-cell';
import { matchPresetName } from '../../presets';

import { formatDateTimeTz } from '@/lib/format';

export function useAgentColumns(): ColumnDef<Agent>[] {
  const { t } = useTranslation();
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }: { column: Column<Agent, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('name')} />
      ),
      cell: ({ row }) => {
        const presetName = matchPresetName(row.original.systemPrompt);
        return (
          <Link href={`/dashboard/agents/${row.original.id}`} className='flex flex-col'>
            <span className='inline-flex items-center gap-1.5'>
              <span className='font-medium hover:underline'>{row.original.name}</span>
              <Badge variant='outline' className='text-[10px] px-1.5 py-0 leading-relaxed'>
                {row.original.platform === 'wechat' ? t('WeChat') : t('Lark / Feishu')}
              </Badge>
              {presetName && (
                <Badge variant='secondary' className='text-[10px] px-1.5 py-0 leading-relaxed'>
                  {presetName}
                </Badge>
              )}
              {row.original.platform === 'wechat' && row.original.platformConfig?.needsReauth && (
                <Badge variant='destructive' className='text-[10px] px-1.5 py-0 leading-relaxed'>
                  {t('Re-scan required')}
                </Badge>
              )}
            </span>
            {row.original.description && (
              <span className='text-muted-foreground text-xs'>{row.original.description}</span>
            )}
          </Link>
        );
      },
      meta: {
        label: t('name'),
        placeholder: t('Search...'),
        variant: 'text' as const,
        icon: Icons.text
      },
      enableColumnFilter: true
    },
    {
      id: 'llmModelName',
      accessorKey: 'llmModelName',
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('Bound LLM')} />,
      cell: ({ row }) => (
        <span className='text-muted-foreground text-xs'>
          {row.original.llmModelName ?? t('No LLM model')}
        </span>
      ),
      meta: { label: t('Bound LLM') }
    },
    {
      id: 'status',
      accessorKey: 'status',
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('Status')} />,
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === 'active' ? 'default' : 'secondary'}
          className='text-xs'
        >
          {row.original.status === 'active' ? t('active') : t('paused')}
        </Badge>
      ),
      meta: { label: t('Status') }
    },
    {
      id: 'userAuth',
      accessorFn: () => '',
      size: 120,
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('User Identity')} />,
      cell: ({ row }) => <AgentAuthCell agentId={row.original.id} />,
      meta: { label: t('User Identity') }
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('Created At')} />,
      cell: ({ row }) => (
        <span className='text-muted-foreground text-xs whitespace-nowrap'>
          {formatDateTimeTz(row.original.createdAt)}
        </span>
      ),
      meta: { label: t('Created At') }
    },
    {
      id: 'actions',
      size: 50,
      cell: ({ row }) => <CellAction data={row.original} />,
      meta: { label: t('Actions') }
    }
  ];
}
