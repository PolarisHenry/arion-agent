import LlmModelListingPage from '@/features/llm-models/components/llm-model-listing';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { PageClient } from './page-client';

export const metadata = {
  title: 'Dashboard: LLM Models'
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function LlmModelsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);
  return (
    <PageClient>
      <LlmModelListingPage />
    </PageClient>
  );
}
