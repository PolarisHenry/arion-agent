'use client';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { User } from '../../api/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { CellAction } from './cell-action';
import { useTranslation } from '@/lib/i18n';

import { formatDateTimeTz } from '@/lib/format';

export function useUserColumns(): ColumnDef<User>[] {
  const { t } = useTranslation();

  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }: { column: Column<User, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('Name')} />
      ),
      cell: ({ row }) => (
        <div className='flex flex-col'>
          <span className='font-medium'>{row.original.name}</span>
          <span className='text-muted-foreground text-xs'>{row.original.email}</span>
        </div>
      ),
      meta: {
        label: t('Name'),
        placeholder: t('Search users...'),
        variant: 'text' as const,
        icon: Icons.text
      },
      enableColumnFilter: true
    },
    {
      accessorKey: 'email',
      header: t('EMAIL'),
      meta: {
        label: t('EMAIL')
      }
    },
    {
      id: 'type',
      accessorKey: 'ownerId',
      enableSorting: false,
      header: ({ column }: { column: Column<User, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('Type')} />
      ),
      cell: ({ row }) => {
        const isMaster = row.original.ownerId === null;
        return (
          <Badge variant={isMaster ? 'default' : 'outline'} className='capitalize'>
            {isMaster ? t('Master Account') : t('Sub Account')}
          </Badge>
        );
      },
      enableColumnFilter: true,
      meta: {
        label: t('Type')
      }
    },
    {
      id: 'enabled',
      accessorKey: 'enabled',
      enableSorting: false,
      header: ({ column }: { column: Column<User, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => {
        const isEnabled = row.original.enabled !== false;
        return (
          <Badge variant={isEnabled ? 'default' : 'outline'} className='capitalize'>
            {isEnabled ? t('Enabled') : t('Disabled')}
          </Badge>
        );
      },
      meta: {
        label: t('Status')
      }
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      enableSorting: false,
      header: ({ column }: { column: Column<User, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('Created At')} />
      ),
      cell: ({ row }) => (
        <span className='text-muted-foreground text-xs whitespace-nowrap'>
          {formatDateTimeTz(row.original.createdAt)}
        </span>
      ),
      meta: {
        label: t('Created At')
      }
    },
    {
      id: 'updatedAt',
      accessorKey: 'updatedAt',
      enableSorting: false,
      header: ({ column }: { column: Column<User, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('Updated At')} />
      ),
      cell: ({ row }) => (
        <span className='text-muted-foreground text-xs whitespace-nowrap'>
          {formatDateTimeTz(row.original.updatedAt)}
        </span>
      ),
      meta: {
        label: t('Updated At')
      }
    },
    {
      id: 'actions',
      size: 50,
      cell: ({ row }) => <CellAction data={row.original} />,
      meta: {
        label: t('Actions')
      }
    }
  ];
}
