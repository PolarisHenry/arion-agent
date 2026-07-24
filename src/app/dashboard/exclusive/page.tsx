'use client';

import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';

export default function ExclusivePage() {
  const { t } = useTranslation();

  return (
    <PageContainer>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Icons.exclusive className='h-5 w-5' />
            {t('专属功能')}
          </CardTitle>
          <CardDescription>{t('高级功能和专属内容')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>{t('专属于 Pro 用户的高级功能区域。')}</p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
