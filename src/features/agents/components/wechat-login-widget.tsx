'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import {
  startWechatLogin,
  startWechatReauth,
  pollWechatLogin,
  type WechatLoginStatus
} from '../api/service';

// ============================================================
// WeChatLoginWidget — scan-to-create OR re-scan an existing
// WeChat (iLink) agent.
//  · create:  POSTs a new agent's fields, polls status, renders QR
//             (reusing the generic register-app/qr image endpoint).
//  · reauth:  re-scans an existing agent whose session expired (-14);
//             the server refreshes its identity + clears needsReauth.
// Calls onConfirmed once the server has confirmed the scan.
// ============================================================

interface CreatePayload {
  name: string;
  systemPrompt: string;
  llmModelId: string;
  description?: string;
  linkedAgentId?: string;
}

interface Props {
  /** 'create' = new agent (needs payload); 'reauth' = re-scan existing (needs agentId). */
  mode?: 'create' | 'reauth';
  /** create mode only. */
  payload?: CreatePayload;
  /** reauth mode only. */
  agentId?: string;
  onConfirmed: () => void;
}

export function WeChatLoginWidget({ mode = 'create', payload, agentId, onConfirmed }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string>('');
  const [status, setStatus] = useState<WechatLoginStatus['status'] | 'idle' | 'starting'>('idle');
  const [error, setError] = useState<string>('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    if (mode === 'create') {
      if (!payload?.name.trim() || !payload?.systemPrompt.trim() || !payload?.llmModelId) {
        toast.error(t('Fill name, system prompt, and LLM first'));
        return;
      }
    } else if (!agentId) {
      return;
    }
    setStatus('starting');
    setError('');
    try {
      const { sessionId } =
        mode === 'create'
          ? await startWechatLogin({
              name: payload!.name.trim(),
              systemPrompt: payload!.systemPrompt.trim(),
              llmModelId: payload!.llmModelId,
              description: payload!.description?.trim() || undefined,
              linkedAgentId: payload!.linkedAgentId || undefined
            })
          : await startWechatReauth(agentId!);
      setStatus('pending');
      timerRef.current = setInterval(async () => {
        try {
          const s = await pollWechatLogin(sessionId);
          if (s.url) setUrl(s.url);
          setStatus(s.status);
          if (s.error) setError(s.error);
          if (s.status === 'confirmed') {
            stop();
            toast.success(t(mode === 'create' ? 'WeChat agent created' : 'WeChat re-authorized'));
            onConfirmedRef.current();
          } else if (s.status === 'error' || s.status === 'unknown') {
            stop();
          }
        } catch {
          /* transient — retry next tick */
        }
      }, 2000);
    } catch (err: any) {
      setStatus('error');
      setError(err?.message || 'Failed');
    }
  }, [mode, payload, agentId, t, stop]);

  const reset = useCallback(() => {
    stop();
    setStatus('idle');
    setUrl('');
    setError('');
  }, [stop]);

  const scanning = status === 'pending' || status === 'qr' || status === 'scanned';
  const showQr = scanning && url;
  const busy = status === 'starting' || status === 'pending';

  return (
    <div className='space-y-3 rounded-lg border p-4'>
      <div className='rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'>
        ⚠️{' '}
        {t(
          'WeChat login uses an unofficial channel (iLink) — use an account whose loss you can accept.'
        )}
      </div>

      {!showQr && status !== 'confirmed' && (
        <Button type='button' variant='outline' className='w-full' onClick={start} isLoading={busy}>
          {mode === 'create' ? t('Scan to create (WeChat)') : t('Re-scan')}
        </Button>
      )}

      {showQr && (
        <div className='flex flex-col items-center gap-2'>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR is a scannable code; next/image would blur it */}
          <img
            src={`/api/agents/register-app/qr?url=${encodeURIComponent(url)}`}
            alt='QR Code'
            className='h-48 w-48 rounded-lg border'
          />
          <a
            href={url}
            target='_blank'
            rel='noopener noreferrer'
            className='text-primary break-all text-center text-xs underline'
          >
            {url}
          </a>
          <p className='text-muted-foreground flex items-center gap-1 text-xs'>
            <span className='inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400' />
            {status === 'scanned' ? t('Scanned — awaiting confirmation') : t('Waiting for scan...')}
          </p>
          <Button type='button' variant='ghost' size='sm' onClick={reset}>
            {t('Cancel')}
          </Button>
        </div>
      )}

      {status === 'confirmed' && (
        <p className='text-center text-sm font-medium text-green-600'>
          ✅ {mode === 'create' ? t('WeChat agent created') : t('WeChat re-authorized')}
        </p>
      )}
      {status === 'error' && (
        <p className='text-center text-sm text-red-500'>❌ {error || t('Failed')}</p>
      )}
    </div>
  );
}
