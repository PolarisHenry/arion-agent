'use client';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { Product } from '../../api/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Icons } from '@/components/icons';
import Image from 'next/image';
import { CellAction } from './cell-action';
import { CATEGORY_OPTIONS } from './options';
import { useTranslation } from '@/lib/i18n';

export function useProductColumns(): ColumnDef<Product>[] {
  const { t } = useTranslation();

  return [
    {
      accessorKey: 'photo_url',
      header: t('IMAGE'),
      cell: ({ row }) => {
        return (
          <div className='relative aspect-square'>
            <Image
              src={row.getValue('photo_url')}
              alt={row.getValue('name')}
              fill
              sizes='80px'
              className='rounded-lg'
            />
          </div>
        );
      },
      meta: {
        label: t('IMAGE')
      }
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }: { column: Column<Product, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('Name')} />
      ),
      cell: ({ cell }) => <div>{cell.getValue<Product['name']>()}</div>,
      meta: {
        label: t('Name'),
        placeholder: t('Search products...'),
        variant: 'text',
        icon: Icons.text
      },
      enableColumnFilter: true
    },
    {
      id: 'category',
      accessorKey: 'category',
      enableSorting: false,
      header: ({ column }: { column: Column<Product, unknown> }) => (
        <DataTableColumnHeader column={column} title={t('Category')} />
      ),
      cell: ({ cell }) => {
        const status = cell.getValue<Product['category']>();
        const Icon = status === 'active' ? Icons.circleCheck : Icons.xCircle;

        return (
          <Badge variant='outline' className='capitalize'>
            <Icon />
            {status}
          </Badge>
        );
      },
      enableColumnFilter: true,
      meta: {
        label: t('categories'),
        variant: 'multiSelect',
        options: CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))
      }
    },
    {
      accessorKey: 'price',
      header: t('PRICE'),
      meta: {
        label: t('PRICE')
      }
    },
    {
      accessorKey: 'description',
      header: t('DESCRIPTION'),
      meta: {
        label: t('DESCRIPTION')
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
