'use client';

import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';

export default function CtaGithub() {
  const { t } = useTranslation();

  return (
    <Button
      variant='ghost'
      size='sm'
      className='group hidden sm:flex'
      nativeButton={false}
      render={
        <a
          aria-label={t('View on GitHub')}
          href='https://github.com/PolarisHenry/arion-agent'
          rel='noopener noreferrer'
          target='_blank'
          className='dark:text-foreground transition-colors duration-300 hover:text-[#24292e] dark:hover:text-yellow-400'
        />
      }
    >
      <Icons.github className='transition-transform duration-300 group-hover:animate-bounce' />
    </Button>
  );
}
