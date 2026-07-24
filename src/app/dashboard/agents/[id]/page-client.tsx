'use client';

import PageContainer from '@/components/layout/page-container';
import { Suspense } from 'react';
import { AgentDetailTabsSkeleton } from '@/features/agents/components/agent-detail/agent-detail-tabs';

export function PageClient({ children, agentId }: { children: React.ReactNode; agentId: string }) {
  return (
    <PageContainer>
      <Suspense fallback={<AgentDetailTabsSkeleton />}>{children}</Suspense>
    </PageContainer>
  );
}
