'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

export default function NoAccessPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await signOut();
    router.push('/sign-in');
  };

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-sm space-y-6 text-center'>
        <div className='space-y-2'>
          <h1 className='text-2xl font-bold'>{t('No Access')}</h1>
          <p className='text-muted-foreground text-sm'>
            {t('You do not have permission to access any pages. Please contact the administrator.')}
          </p>
        </div>
        <Button className='w-full' onClick={handleSignOut} isLoading={loading}>
          {t('Sign Out')}
        </Button>
      </div>
    </div>
  );
}
