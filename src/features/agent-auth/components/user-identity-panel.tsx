'use client';

import { useState } from 'react';
import { useSuspenseQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { agentUserAuthQueryOptions } from '@/features/agent-auth/api/queries';
import { userAuthActionMutation } from '@/features/agent-auth/api/mutations';
import { DeviceFlowDialog } from './device-flow-dialog';
import { Icons } from '@/components/icons';
import { formatDateTimeTz } from '@/lib/format';

export function UserIdentityPanel({ agentId }: { agentId: string }) {
  const { t } = useTranslation();

  const { data: auth } = useSuspenseQuery(agentUserAuthQueryOptions(agentId));

  const revokeMutation = useMutation(userAuthActionMutation);

  const [showDialog, setShowDialog] = useState(false);

  const status = auth?.status ?? 'none';

  // Determine badge color and label
  const statusBadge = () => {
    switch (status) {
      case 'authorized': {
        const expired = auth?.tokenExpiresAt && new Date(auth.tokenExpiresAt) < new Date();
        if (expired) {
          return (
            <Badge variant='destructive' className='text-xs'>
              {t('Expired')}
            </Badge>
          );
        }
        const nearExpiry =
          auth?.tokenExpiresAt &&
          new Date(auth.tokenExpiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000;
        return (
          <Badge variant={nearExpiry ? 'secondary' : 'default'} className='text-xs'>
            {t('Authorized')}
            {auth?.userName ? ` · ${auth.userName}` : ''}
          </Badge>
        );
      }
      case 'awaiting_user':
        return (
          <Badge variant='secondary' className='text-xs'>
            {t('Awaiting Authorization')}
          </Badge>
        );
      case 'pending_start':
      case 'completing':
      case 'revoking':
        return (
          <Badge variant='outline' className='text-xs animate-pulse'>
            {t('Processing...')}
          </Badge>
        );
      case 'error':
        return (
          <Badge variant='destructive' className='text-xs'>
            {t('Auth Error')}
          </Badge>
        );
      case 'revoked':
        return (
          <Badge variant='outline' className='text-xs'>
            {t('Revoked')}
          </Badge>
        );
      default:
        return (
          <Badge variant='outline' className='text-xs'>
            {t('Not Authorized')}
          </Badge>
        );
    }
  };

  return (
    <>
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <Icons.key className='size-4' />
            {t('User Identity')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <div className='flex items-center gap-2'>
            <span className='text-muted-foreground'>{t('Status')}:</span>
            {statusBadge()}
          </div>

          {auth?.userName && (
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>{t('User')}:</span>
              <span className='font-medium'>{auth.userName}</span>
            </div>
          )}

          {auth?.grantedScopes &&
            Array.isArray(auth.grantedScopes) &&
            auth.grantedScopes.length > 0 && (
              <div>
                <span className='text-muted-foreground'>{t('Scopes')}:</span>
                <div className='mt-1 flex flex-wrap gap-1'>
                  {(auth.grantedScopes as string[]).map((s: string) => (
                    <Badge key={s} variant='outline' className='text-xs font-mono'>
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

          {auth?.tokenExpiresAt && (
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>{t('Token Expires')}:</span>
              <span className='text-xs'>{formatDateTimeTz(auth.tokenExpiresAt)}</span>
            </div>
          )}

          {auth?.errorMsg && (
            <div className='rounded bg-destructive/10 p-2 text-xs text-destructive'>
              {auth.errorMsg}
            </div>
          )}

          {status === 'authorized' && (
            <div className='text-muted-foreground text-xs'>
              {t('Feishu scopes only grow — to narrow, revoke and re-authorize.')}
            </div>
          )}

          <div className='flex gap-2 pt-2'>
            {(status === 'none' ||
              status === 'revoked' ||
              status === 'error' ||
              status === 'revoking') && (
              <Button variant='default' size='sm' onClick={() => setShowDialog(true)}>
                <Icons.key className='mr-1 size-3' />
                {t('Authorize User Identity')}
              </Button>
            )}

            {status === 'authorized' && auth && (
              <>
                {auth.tokenExpiresAt && new Date(auth.tokenExpiresAt) < new Date() ? (
                  <Button variant='default' size='sm' onClick={() => setShowDialog(true)}>
                    {t('Re-authorize')}
                  </Button>
                ) : (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => revokeMutation.mutate({ agentId, action: 'revoke' })}
                    disabled={revokeMutation.isPending}
                  >
                    <Icons.trash className='mr-1 size-3' />
                    {t('Revoke Authorization')}
                  </Button>
                )}
              </>
            )}

            {status === 'awaiting_user' && (
              <Button variant='default' size='sm' onClick={() => setShowDialog(true)}>
                <Icons.eye className='mr-1 size-3' />
                {t('Continue Authorization')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {showDialog && (
        <DeviceFlowDialog
          agentId={agentId}
          open={showDialog}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  );
}
