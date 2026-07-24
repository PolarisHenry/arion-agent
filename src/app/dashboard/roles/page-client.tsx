'use client';

import PageContainer from '@/components/layout/page-container';
import { Suspense } from 'react';
import { RolesTableSkeleton } from '@/features/roles/components/roles-table';

export function PageClient({ children }: { children: React.ReactNode }) {
  return (
    <PageContainer>
      <Suspense fallback={<RolesTableSkeleton />}>{children}</Suspense>
    </PageContainer>
  );
}
