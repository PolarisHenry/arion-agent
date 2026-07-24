'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: '/dashboard/overview'
    });

    if (result?.error) {
      setError(result.error.message || t('Sign up failed'));
      setLoading(false);
      return;
    }

    router.push('/dashboard/overview');
  };

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-sm space-y-6'>
        <div className='space-y-2 text-center'>
          <h1 className='text-2xl font-bold'>{t('Sign Up')}</h1>
          <p className='text-muted-foreground text-sm'>{t('Create a new account')}</p>
        </div>

        <form onSubmit={handleSubmit} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='name'>{t('Username')}</Label>
            <Input
              id='name'
              type='text'
              placeholder={t('Your username')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

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
              autoComplete='new-password'
              placeholder={t('Min 8 chars password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {error && <p className='text-destructive text-sm'>{error}</p>}

          <Button type='submit' className='w-full' isLoading={loading}>
            {t('Sign Up')}
          </Button>
        </form>

        <p className='text-center text-sm text-muted-foreground'>
          {t('Already have an account?')}{' '}
          <Link href='/sign-in' className='text-primary underline underline-offset-4'>
            {t('Sign In')}
          </Link>
        </p>
      </div>
    </div>
  );
}
