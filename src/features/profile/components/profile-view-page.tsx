'use client';

import { useState } from 'react';
import { useSession, changePassword } from '@/lib/auth-client';
import { useTranslation } from '@/lib/i18n';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

function ChangePasswordForm() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) {
      toast.error(t('Must be at least 8 characters'));
      return;
    }
    if (next !== confirm) {
      toast.error(t('Passwords do not match'));
      return;
    }
    setLoading(true);
    const res = await changePassword({
      currentPassword: current,
      newPassword: next
    });
    setLoading(false);

    if (res?.error) {
      toast.error(t(res.error.message || 'Failed to update password'));
      return;
    }
    toast.success(t('Password updated successfully'));
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const canSubmit = !!current && next.length >= 8 && next === confirm;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Change Password')}</CardTitle>
        <CardDescription>{t('Update your account password.')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className='max-w-sm space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='current-password'>{t('Current Password')}</Label>
            <PasswordInput
              id='current-password'
              name='current-password'
              autoComplete='current-password'
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='new-password'>{t('New Password')}</Label>
            <PasswordInput
              id='new-password'
              name='new-password'
              autoComplete='new-password'
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder={t('Min 8 characters')}
              required
              minLength={8}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='confirm-password'>{t('Confirm Password')}</Label>
            <PasswordInput
              id='confirm-password'
              name='confirm-password'
              autoComplete='new-password'
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type='submit' isLoading={loading} disabled={!canSubmit}>
            {t('Update Password')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ProfileViewPage() {
  const { data: session } = useSession();
  const user = session?.user;
  const { t } = useTranslation();

  if (!user) return null;

  return (
    <PageContainer>
      <div className='flex w-full flex-col gap-6 p-4'>
        <div className='max-w-lg space-y-6'>
          <div>
            <h2 className='text-xl font-bold'>{user.name}</h2>
            <p className='text-muted-foreground'>{user.email}</p>
          </div>
          <div className='space-y-2'>
            <div className='flex justify-between border-b py-2'>
              <span className='text-muted-foreground'>{t('用户名')}</span>
              <span>{user.name}</span>
            </div>
            <div className='flex justify-between border-b py-2'>
              <span className='text-muted-foreground'>{t('邮箱')}</span>
              <span>{user.email}</span>
            </div>
            <div className='flex justify-between border-b py-2'>
              <span className='text-muted-foreground'>{t('邮箱验证')}</span>
              <span>{user.emailVerified ? t('已验证') : t('未验证')}</span>
            </div>
          </div>
        </div>
        <div className='max-w-lg'>
          <ChangePasswordForm />
        </div>
      </div>
    </PageContainer>
  );
}
