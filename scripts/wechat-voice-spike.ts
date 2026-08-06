// ============================================================
// WeChat VOICE spike — capture one real voice message and dump
// everything we need to pick the STT pipeline:
//   · msg.voices[*]  — encodeType / text (server ASR?) / durationMs
//   · bot.download() — the SDK already transcodes; DownloadedMedia.format
//                      is 'wav' | 'silk'. 'wav' → feed straight to STT;
//                      'silk' → decode with silk-wasm first.
//   · magic bytes    — cross-check the real codec on the wire.
//
// Run (inside the worker container, which has deps + the creds volume):
//   1. Stop the agent first — only ONE poller per WeChat account, or the
//      cursors collide:
//        docker compose stop worker
//   2. Resume the existing agent's session (no re-scan) by passing its id:
//        docker compose run --rm worker pnpm tsx scripts/wechat-voice-spike.ts <agentId>
//      (no arg → fresh QR login to /tmp/wechat-voice-spike)
//   3. DM the bot a voice message. The script logs the dump and exits.
//   4. docker compose start worker
//
// Throwaway — delete once the voice pipeline is built.
// ============================================================

import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { WeChatBot } from '@wechatbot/wechatbot';

const log = (...a: unknown[]) => console.log(...a); // eslint-disable-line no-console

const agentId = process.argv[2];
const base = process.env.WECHATBOT_DATA_DIR ?? join(homedir(), '.wechatbot');
const storageDir = agentId ? join(base, agentId) : '/tmp/wechat-voice-spike';
log(`storageDir = ${storageDir}${agentId ? ' (resuming existing session)' : ' (fresh QR login)'}`);

const bot = new WeChatBot({ storageDir, botAgent: 'arion-agent/voice-spike' });

function sniff(buf: Buffer): string {
  const head = buf.subarray(0, 12);
  const ascii = head.toString('latin1');
  const hex = buf.subarray(0, 16).toString('hex').match(/.{1,2}/g)?.join(' ');
  if (ascii.startsWith('RIFF')) return `WAV (hex: ${hex})`;
  if (ascii.startsWith('#!SILK_V3') || buf[0] === 0x02) return `SILK (hex: ${hex})`;
  if (ascii.startsWith('#!AMR')) return `AMR (hex: ${hex})`;
  if (ascii.startsWith('OggS')) return `OGG/Opus (hex: ${hex})`;
  if (ascii.startsWith('ID3') || buf[0] === 0xff) return `MP3 (hex: ${hex})`;
  return `unknown (ascii: ${JSON.stringify(ascii)} | hex: ${hex})`;
}

bot.onMessage(async (msg) => {
  log('\n===== INBOUND =====');
  log({ type: msg.type, userId: msg.userId, text: msg.text, voiceCount: msg.voices?.length });

  if (!msg.voices || msg.voices.length === 0) {
    log('(no voice in this message — send a voice message to the bot)');
    return;
  }

  for (let i = 0; i < msg.voices.length; i++) {
    const v = msg.voices[i];
    log(`\n--- voice[${i}] parsed ---`);
    log({
      encodeType: v.encodeType,
      text: v.text, // ← if populated, WeChat already transcribed it server-side
      durationMs: v.durationMs,
      hasMedia: Boolean(v.media)
    });

    try {
      const dl = await bot.download(msg);
      if (!dl) {
        log('bot.download() returned null (no media found)');
        continue;
      }
      log('\n--- downloaded ---');
      log({
        type: dl.type,
        format: dl.format, // ← 'wav' | 'silk' (SDK transcoded)
        fileName: dl.fileName,
        bytes: dl.data.length,
        magic: sniff(dl.data)
      });
      const ext = dl.format || 'bin';
      const out = `/tmp/wx-voice-${Date.now()}.${ext}`;
      writeFileSync(out, dl.data);
      log(`wrote buffer → ${out}`);
    } catch (err: any) {
      log('bot.download() failed:', err?.message ?? err);
    }
  }

  log('\n===== done — exiting =====');
  bot.stop();
  process.exit(0);
});

await bot.login(
  agentId
    ? {} // resume stored creds
    : {
        callbacks: {
          onQrUrl: (url) => log('Scan (paste into a browser to render QR):\n', url),
          onScanned: () => log('scanned — awaiting confirmation'),
          onExpired: () => log('QR expired')
        }
      }
);
log('logged in as', bot.getCredentials()?.accountId, '— send the bot a voice message.');
await bot.start(); // blocks; exits via process.exit after the first voice
