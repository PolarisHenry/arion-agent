import RoleListingPage from '@/features/roles/components/role-listing';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { PageClient } from './page-client';

export const metadata = {
  title: 'Dashboard: Roles'
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function RolesPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <PageClient>
      <RoleListingPage />
    </PageClient>
  );
}
