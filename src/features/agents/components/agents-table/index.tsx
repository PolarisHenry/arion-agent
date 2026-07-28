'use client';

import { DataTable } from '@/components/ui/table/data-table';
import { DataTableToolbar } from '@/components/ui/table/data-table-toolbar';
import { AgentFormSheetTrigger } from '../agent-form-sheet';
import { useDataTable } from '@/hooks/use-data-table';
import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { getSortingStateParser } from '@/lib/parsers';
import { agentsQueryOptions } from '../../api/queries';
import { useAgentColumns } from './columns';

export function AgentsTable() {
  const [params] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    perPage: parseAsInteger.withDefault(10),
    name: parseAsString,
    // Match the columns the table actually marks sortable; `[]` here would make
    // the parser reject every sort id and leave params.sort permanently empty.
    sort: getSortingStateParser(['name', 'createdAt']).withDefault([])
  });

  const firstSort = params.sort[0];
  const filters = {
    page: params.page,
    limit: params.perPage,
    ...(params.name && { search: params.name }),
    // Including sort/order in `filters` also bakes them into the query key, so
    // React Query refetches when the URL sort changes (manualSorting is server-side).
    ...(firstSort && {
      sort: String(firstSort.id),
      order: (firstSort.desc ? 'desc' : 'asc') as 'asc' | 'desc'
    })
  };

  const { data } = useSuspenseQuery(agentsQueryOptions(filters));
  const pageCount = Math.ceil(data.total / params.perPage);
  const columns = useAgentColumns();

  const { table } = useDataTable({
    data: data.agents,
    columns,
    pageCount,
    shallow: true,
    debounceMs: 500,
    initialState: { columnPinning: { right: ['actions'] } }
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table}>
        <AgentFormSheetTrigger />
      </DataTableToolbar>
    </DataTable>
  );
}

export function AgentsTableSkeleton() {
  return (
    <div className='flex flex-1 animate-pulse flex-col gap-4'>
      <div className='bg-muted h-10 w-full rounded' />
      <div className='bg-muted h-96 w-full rounded-lg' />
      <div className='bg-muted h-10 w-full rounded' />
    </div>
  );
}
