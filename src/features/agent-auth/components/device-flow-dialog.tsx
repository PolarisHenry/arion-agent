'use client';

import { useState, useEffect, useRef } from 'react';
import { useSuspenseQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { agentUserAuthQueryOptions } from '@/features/agent-auth/api/queries';
import { userAuthActionMutation } from '@/features/agent-auth/api/mutations';
import { Icons } from '@/components/icons';
import { copyToClipboard } from '@/lib/clipboard';

type Step = 'init' | 'started' | 'completed' | 'error';

export function DeviceFlowDialog({
  agentId,
  open,
  onClose
}: {
  agentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const { data: auth, refetch } = useSuspenseQuery(agentUserAuthQueryOptions(agentId));

  const startMutation = useMutation(userAuthActionMutation);

  const [step, setStep] = useState<Step>('init');
  const [copied, setCopied] = useState(false);
  // Guards against firing POST /start more than once per open lifecycle.
  const startInitiated = useRef(false);

  // Derive the UI step from the current server-side status.
  useEffect(() => {
    if (!open) return;
    const status = auth?.status;
    if (status === 'authorized') {
      // Only jump to completed if the token is NOT expired — an expired
      // authorized row needs a fresh device flow, not a "success" screen.
      const expired = auth?.tokenExpiresAt && new Date(auth.tokenExpiresAt) < new Date();
      if (expired) {
        // Don't jump to completed — stay in init so the start effect below
        // kicks off a new device flow.
        return;
      }
      setStep('completed');
    } else if (status === 'error') {
      setStep('error');
    } else if (status === 'awaiting_user') {
      setStep('started');
    }
    // pending_start / completing / revoking → keep current step while transitioning
  }, [open, auth?.status, auth?.tokenExpiresAt]);

  // Kick off a fresh device flow once per open, when nothing is in progress.  An
  // expired 'authorized' row is also eligible for a new flow (status is not a
  // live flow state, so it passes through the guard below).
  useEffect(() => {
    if (!open || startInitiated.current) return;
    const status = auth?.status;
    if (status === 'awaiting_user' || status === 'pending_start' || status === 'completing') {
      return; // a flow is already live or starting — just observe it
    }
    startInitiated.current = true;
    startMutation.mutate({ agentId, action: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, auth?.status, auth?.tokenExpiresAt]);

  // Poll for status changes while open and not in a terminal state. The worker
  // auto-completes the device flow, so the dialog just reflects the result.
  useEffect(() => {
    if (!open) return;
    if (step === 'completed' || step === 'error') return;
    const interval = setInterval(() => refetch(), 2500);
    return () => clearInterval(interval);
  }, [open, step, refetch]);

  // Reset transient state when the dialog closes so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      startInitiated.current = false;
      setStep('init');
    }
  }, [open]);

  const handleRestart = () => {
    startInitiated.current = true;
    setStep('init');
    startMutation.mutate({ agentId, action: 'start' });
  };

  const handleCopyUrl = async () => {
    if (!auth?.verificationUrl) return;
    try {
      await copyToClipboard(auth.verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 复制失败(如权限被拒)时保持「未复制」状态,不翻转图标误导用户。
    }
  };

  const verificationUrl = auth?.verificationUrl ?? '';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Authorize User Identity')}</DialogTitle>
          <DialogDescription>
            {step === 'completed'
              ? t('Authorization successful! The agent can now act on your behalf.')
              : step === 'error'
                ? t('Auth Error')
                : step === 'started'
                  ? t('Scan the QR code or open the link below to authorize.')
                  : t('Preparing authorization...')}
          </DialogDescription>
        </DialogHeader>

        {(step === 'init' || step === 'started') && (
          <div className='space-y-4'>
            {verificationUrl && (
              <div className='flex justify-center'>
                {/* eslint-disable-next-line next/no-img-element */}
                <img
                  src={`https://api.qrcode-monkey.com/qr/custom?data=${encodeURIComponent(verificationUrl)}&size=200&config=${encodeURIComponent(JSON.stringify({ body: 'circle', eye: 'frame0', eyeBall: 'ball0' }))}`}
                  alt='QR Code'
                  className='size-48 rounded-lg border'
                />
              </div>
            )}

            {verificationUrl && (
              <div className='flex items-center gap-2'>
                <code className='bg-muted flex-1 rounded px-2 py-1 text-xs break-all'>
                  {verificationUrl}
                </code>
                <Button variant='outline' size='sm' onClick={handleCopyUrl}>
                  {copied ? (
                    <Icons.check className='size-3' />
                  ) : (
                    <Icons.upload className='size-3' />
                  )}
                </Button>
              </div>
            )}

            {step === 'started' && (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Scan the QR code or open the link to authorize. It completes automatically once you approve — keep this window open.'
                )}
              </p>
            )}
          </div>
        )}

        {step === 'completed' && (
          <div className='flex flex-col items-center gap-3 py-6'>
            <Icons.check className='size-12 text-green-500' />
            <p className='text-sm font-medium'>
              {t('Authorized')}
              {auth?.userName ? ` — ${auth.userName}` : ''}
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className='flex flex-col items-center gap-3 py-4'>
            <Icons.alertCircle className='size-10 text-destructive' />
            <p className='text-destructive text-center text-sm'>
              {auth?.errorMsg || t('Auth Error')}
            </p>
            <Button
              variant='outline'
              size='sm'
              onClick={handleRestart}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? (
                <Icons.spinner className='mr-1 size-3 animate-spin' />
              ) : (
                <Icons.key className='mr-1 size-3' />
              )}
              {t('Re-authorize')}
            </Button>
          </div>
        )}

        <DialogFooter className='gap-2 sm:gap-0'>
          {step === 'completed' ? (
            <Button onClick={onClose}>{t('Done Auth')}</Button>
          ) : (
            <Button variant='outline' onClick={onClose}>
              {t('Cancel Auth')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
