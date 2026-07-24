'use client';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';
import type { LlmModel } from '../../api/types';
import { CellAction } from './cell-action';

import { formatDateTimeTz } from '@/lib/format';

export function useLlmModelColumns(): ColumnDef<LlmModel>[] {
  const { t } = useTranslation();
  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }: { column: Column<LlmModel, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('name')} />
      ),
      cell: ({ row }) => (
        <div className='flex flex-col'>
          <span className='font-medium'>{row.original.name}</span>
          <span className='text-muted-foreground text-xs'>{row.original.modelName}</span>
        </div>
      ),
      meta: {
        label: t('name'),
        placeholder: t('Search...'),
        variant: 'text' as const,
        icon: Icons.text
      },
      enableColumnFilter: true
    },
    {
      id: 'provider',
      accessorKey: 'provider',
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('Provider')} />,
      cell: ({ row }) => (
        <Badge variant='outline' className='text-xs'>
          {row.original.provider}
        </Badge>
      ),
      meta: { label: t('Provider') }
    },
    {
      id: 'apiKeyMasked',
      accessorKey: 'apiKeyMasked',
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('API Key Masked')} />,
      cell: ({ row }) => (
        <span className='text-muted-foreground font-mono text-xs'>{row.original.apiKeyMasked}</span>
      ),
      meta: { label: t('API Key Masked') }
    },
    {
      id: 'isActive',
      accessorKey: 'isActive',
      enableSorting: false,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('Active')} />,
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'} className='text-xs'>
          {row.original.isActive ? t('active') : t('paused')}
        </Badge>
      ),
      meta: { label: t('Active') }
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
