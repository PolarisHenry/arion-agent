'use client';

import { useState, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { getAgentUserAuth } from '../api/service';
import { agentAuthKeys } from '../api/queries';
import { DeviceFlowDialog } from './device-flow-dialog';

export function AgentAuthCell({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const [showDialog, setShowDialog] = useState(false);

  const { data: auth, isLoading } = useQuery({
    queryKey: agentAuthKeys.all(agentId),
    queryFn: () => getAgentUserAuth(agentId),
    staleTime: 10_000
  });

  if (isLoading) {
    return <span className='text-muted-foreground text-xs'>—</span>;
  }

  const status = auth?.status ?? 'none';

  const renderStatus = () => {
    switch (status) {
      case 'authorized': {
        const expired = auth?.tokenExpiresAt && new Date(auth.tokenExpiresAt) < new Date();
        if (expired) {
          return (
            <div className='flex items-center gap-1'>
              <Badge variant='destructive' className='text-xs'>
                {t('Expired')}
              </Badge>
              <Button
                variant='ghost'
                size='icon'
                className='h-5 w-5'
                onClick={() => setShowDialog(true)}
              >
                <Icons.key className='size-3' />
              </Button>
            </div>
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
          <div className='flex items-center gap-1'>
            <Badge variant='secondary' className='text-xs'>
              {t('Awaiting Authorization')}
            </Badge>
            <Button
              variant='ghost'
              size='icon'
              className='h-5 w-5'
              onClick={() => setShowDialog(true)}
            >
              <Icons.eye className='size-3' />
            </Button>
          </div>
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
          <div className='flex items-center gap-1'>
            <Badge variant='destructive' className='text-xs'>
              {t('Auth Error')}
            </Badge>
            <Button
              variant='ghost'
              size='icon'
              className='h-5 w-5'
              onClick={() => setShowDialog(true)}
            >
              <Icons.key className='size-3' />
            </Button>
          </div>
        );
      case 'revoked':
        return (
          <div className='flex items-center gap-1'>
            <Badge variant='outline' className='text-xs'>
              {t('Revoked')}
            </Badge>
            <Button
              variant='ghost'
              size='icon'
              className='h-5 w-5'
              onClick={() => setShowDialog(true)}
            >
              <Icons.key className='size-3' />
            </Button>
          </div>
        );
      default:
        // none — no auth record
        return (
          <Button
            variant='link'
            size='sm'
            className='h-auto p-0 text-xs'
            onClick={() => setShowDialog(true)}
          >
            {t('Not Authorized')}
          </Button>
        );
    }
  };

  return (
    <>
      {renderStatus()}
      {showDialog && (
        <Suspense fallback={null}>
          <DeviceFlowDialog
            agentId={agentId}
            open={showDialog}
            onClose={() => setShowDialog(false)}
          />
        </Suspense>
      )}
    </>
  );
}
