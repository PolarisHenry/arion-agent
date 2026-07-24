import AgentListingPage from '@/features/agents/components/agent-listing';
import { AgentDetailTabs } from '@/features/agents/components/agent-detail/agent-detail-tabs';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { PageClient } from './page-client';

export const metadata = {
  title: 'Dashboard: Agent Detail'
};

type PageProps = {
  searchParams: Promise<SearchParams>;
  params: Promise<{ id: string }>;
};

export default async function AgentDetailPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);
  const { id } = await props.params;

  return (
    <PageClient agentId={id}>
      <AgentDetailTabs agentId={id} />
    </PageClient>
  );
}
