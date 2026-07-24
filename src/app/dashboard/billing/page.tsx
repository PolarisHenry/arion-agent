'use client';

import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';

export default function BillingPage() {
  const { t } = useTranslation();

  return (
    <PageContainer>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Icons.billing className='h-5 w-5' />
            {t('账单管理')}
          </CardTitle>
          <CardDescription>{t('管理你的订阅和账单信息')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            {t('账单功能已就绪。接入支付服务后可启用订阅管理。')}
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
