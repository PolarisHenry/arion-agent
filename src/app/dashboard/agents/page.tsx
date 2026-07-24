import AgentListingPage from '@/features/agents/components/agent-listing';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { PageClient } from './page-client';

export const metadata = {
  title: 'Dashboard: Agents'
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function AgentsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);
  return (
    <PageClient>
      <AgentListingPage />
    </PageClient>
  );
}
