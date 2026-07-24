'use client';

import PageContainer from '@/components/layout/page-container';
import { useTranslation } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export function PageClient({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();

  return (
    <PageContainer>
      <div className='mb-3 flex justify-end'>
        <Link href='/dashboard/product/new' className={cn(buttonVariants(), 'text-xs md:text-sm')}>
          <Icons.add className='mr-2 h-4 w-4' /> {t('Add New')}
        </Link>
      </div>
      {children}
    </PageContainer>
  );
}
