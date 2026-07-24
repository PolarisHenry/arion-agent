'use client';

import PageContainer from '@/components/layout/page-container';

export function PageClient({ children }: { children: React.ReactNode }) {
  return <PageContainer>{children}</PageContainer>;
}
