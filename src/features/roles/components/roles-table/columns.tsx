'use client';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { Role } from '../../api/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import { CellAction } from './cell-action';
import { useTranslation } from '@/lib/i18n';

import { formatDateTimeTz } from '@/lib/format';

export function useRoleColumns(): ColumnDef<Role>[] {
  const { t } = useTranslation();

  return [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }: { column: Column<Role, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('name')} />
      ),
      cell: ({ row }) => (
        <div className='flex flex-col'>
          <span className='font-medium'>{row.original.name}</span>
          {row.original.description && (
            <span className='text-muted-foreground text-xs'>{row.original.description}</span>
          )}
        </div>
      ),
      meta: {
        label: t('name'),
        placeholder: t('Search roles...'),
        variant: 'text' as const,
        icon: Icons.text
      },
      enableColumnFilter: true
    },
    {
      id: 'permissions',
      accessorKey: 'permissions',
      enableSorting: false,
      header: ({ column }: { column: Column<Role, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('Permissions')} />
      ),
      cell: ({ row }) => (
        <div className='flex flex-wrap gap-1'>
          {row.original.permissions.length > 0 ? (
            row.original.permissions.slice(0, 3).map((p: string) => (
              <Badge key={p} variant='outline' className='text-xs'>
                {t(p)}
              </Badge>
            ))
          ) : (
            <span className='text-muted-foreground text-xs'>—</span>
          )}
          {row.original.permissions.length > 3 && (
            <Badge variant='secondary' className='text-xs'>
              +{row.original.permissions.length - 3}
            </Badge>
          )}
        </div>
      ),
      meta: {
        label: t('Permissions')
      }
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      enableSorting: false,
      header: ({ column }: { column: Column<Role, unknown> }) => (
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
      header: ({ column }: { column: Column<Role, unknown> }) => (
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
