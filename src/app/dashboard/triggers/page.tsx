import PageContainer from '@/components/layout/page-container';
import { TriggerOverview } from '@/features/agent-triggers/components/trigger-overview';
import { Suspense } from 'react';

export const metadata = { title: 'Scheduled Tasks' };

export default function TriggersPage() {
  return (
    <PageContainer>
      <Suspense fallback={<div className='bg-muted h-40 w-full animate-pulse rounded-lg' />}>
        <TriggerOverview />
      </Suspense>
    </PageContainer>
  );
}
