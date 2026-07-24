'use client';

import PageContainer from '@/components/layout/page-container';
import { Suspense } from 'react';
import { LlmModelsTableSkeleton } from '@/features/llm-models/components/llm-models-table';

export function PageClient({ children }: { children: React.ReactNode }) {
  return (
    <PageContainer>
      <Suspense fallback={<LlmModelsTableSkeleton />}>{children}</Suspense>
    </PageContainer>
  );
}
