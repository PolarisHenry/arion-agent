'use client';

import PageContainer from '@/components/layout/page-container';
import { Suspense } from 'react';
import { AgentsTableSkeleton } from '@/features/agents/components/agents-table';

export function PageClient({ children }: { children: React.ReactNode }) {
  return (
    <PageContainer>
      <Suspense fallback={<AgentsTableSkeleton />}>{children}</Suspense>
    </PageContainer>
  );
}
