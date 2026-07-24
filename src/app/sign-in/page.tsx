'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard/overview';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await authClient.signIn.email({
      email,
      password,
      callbackURL: callbackUrl
    });

    if (result?.error) {
      setError(result.error.message || t('Sign in failed'));
      setLoading(false);
      return;
    }

    router.push(callbackUrl);
  };

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-sm space-y-6'>
        <div className='space-y-2 text-center'>
          <h1 className='text-2xl font-bold'>{t('Sign In')}</h1>
          <p className='text-muted-foreground text-sm'>
            {t('Enter email and password to sign in')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='email'>{t('Email')}</Label>
            <Input
              id='email'
              name='email'
              type='email'
              autoComplete='email'
              placeholder={t('you@example.com')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='password'>{t('Password')}</Label>
            <PasswordInput
              id='password'
              name='password'
              autoComplete='current-password'
              placeholder={t('Enter password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className='text-destructive text-sm'>{error}</p>}

          <Button type='submit' className='w-full' isLoading={loading}>
            {t('Sign In')}
          </Button>
        </form>

        <p className='text-center text-sm text-muted-foreground'>
          {t("Don't have an account?")}{' '}
          <Link href='/sign-up' className='text-primary underline underline-offset-4'>
            {t('Sign Up')}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  const { t } = useTranslation();

  return (
    <Suspense
      fallback={
        <div className='flex min-h-screen items-center justify-center'>{t('Loading...')}</div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
