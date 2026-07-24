'use client';

import * as React from 'react';

import { Icons } from '@/components/icons';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { Input } from './input';

function PasswordInput({ className, ...props }: React.ComponentProps<'input'>) {
  const [visible, setVisible] = React.useState(false);
  const { t } = useTranslation();

  return (
    <div className='relative'>
      <Input type={visible ? 'text' : 'password'} className={cn('pe-9', className)} {...props} />
      <button
        type='button'
        tabIndex={-1}
        aria-label={visible ? t('Hide') : t('Show')}
        onClick={() => setVisible((v) => !v)}
        className='text-muted-foreground hover:text-foreground absolute top-1/2 right-3 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm outline-none'
      >
        {visible ? <Icons.eyeOff className='size-4' /> : <Icons.eye className='size-4' />}
      </button>
    </div>
  );
}

export { PasswordInput };
