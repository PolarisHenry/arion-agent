// ============================================================
// Image handling — let agents read and manipulate images that
// users send in Feishu IM. Two channels, both fed to the agent's
// OWN model (no separate vision model):
//   • embed  — resize → base64 → image_url block in the user
//              message, so the model can READ the image.
//   • file   — save the original to /tmp so the model can
//              UPLOAD/INSERT it via run_lark_cli on demand.
// Images are transient: no base64 is persisted (see
// stripImagesForPersist), and temp files are cleaned up at the
// end of the turn by the caller (after all tool calls finish).
// ============================================================

import sharp from 'sharp';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { LarkChannel, NormalizedMessage } from '@larksuite/channel';
import type { ContentBlock, LlmMessage } from './llm';
import { createLogger } from './logger';

const log = createLogger('image');

/** Max images ingested from a single message (token + provider guard). */
export const MAX_IMAGES = 4;
/** Vision embeds are downscaled so the long edge ≤ this (OpenAI "high detail" sweet spot). */
const MAX_IMAGE_DIM = 1568;
/** Temp directory for image files the model can manipulate via run_lark_cli. */
const TEMP_DIR = path.join(os.tmpdir(), 'agent-img');

export type PreparedImages = {
  /** One image_url content block per successfully prepared image. */
  imageBlocks: ContentBlock[];
  /** Temp file paths (originals, full quality) for the file channel. */
  tempPaths: string[];
};

/** A message guaranteed to have string content — the shape sessionMgr.save
 *  and SessionManager.truncate expect. Output of stripImagesForPersist. */
export type PersistedMessage = Omit<LlmMessage, 'content'> & { content: string };

/**
 * Download every image resource on `msg` (capped at MAX_IMAGES), save each
 * original to a temp file (for upload/insert via run_lark_cli), and build a
 * resized image_url content block (for the model to read). Best-effort: a
 * per-image failure is logged and skipped; returns null when no image could be
 * prepared. Never throws — image ingest must not break the turn.
 */
export async function downloadAndPrepareImages(
  channel: LarkChannel,
  msg: NormalizedMessage
): Promise<PreparedImages | null> {
  const imageResources = (msg.resources ?? [])
    .filter((r) => r.type === 'image')
    .slice(0, MAX_IMAGES);
  if (imageResources.length === 0) return null;

  await mkdir(TEMP_DIR, { recursive: true }).catch(() => {
    /* ignore — best-effort; per-file writes surface real errors below */
  });

  const imageBlocks: ContentBlock[] = [];
  const tempPaths: string[] = [];

  for (let i = 0; i < imageResources.length; i++) {
    const r = imageResources[i];
    if (!r) continue;
    try {
      const { buffer, contentType } = await channel.downloadResourceWithMeta(
        msg.messageId,
        r.fileKey,
        'image'
      );
      const mime = (contentType || 'image/jpeg').split(';')[0].trim().toLowerCase();

      // Channel B — original bytes to disk for on-demand upload/insert.
      const tempPath = path.join(TEMP_DIR, `${msg.messageId}-${i}.${mimeToExt(mime)}`);
      await writeFile(tempPath, buffer);
      tempPaths.push(tempPath);

      // Channel A — resized base64 for the model to read.
      imageBlocks.push(await prepareEmbedBlock(buffer, mime));
    } catch (err: any) {
      log.warn(`failed to prepare image ${i} (fileKey=${r.fileKey}): ${err?.message ?? err}`);
    }
  }

  if (imageBlocks.length === 0) return null;
  return { imageBlocks, tempPaths };
}

/**
 * Build the user message: original text + an image note, with or without the
 * vision content blocks. Pure — unit-testable.
 *
 *  • withVision=true  → array content [text, ...image_url] (model reads image)
 *  • withVision=false → string content, with a note that the model can't see
 *    the image but can still manipulate it via the temp path (fallback path).
 */
export function buildImageUserMessage(
  originalText: string,
  prepared: PreparedImages | null,
  opts: { withVision: boolean }
): { role: 'user'; content: string | ContentBlock[] } {
  if (!prepared || prepared.imageBlocks.length === 0) {
    return { role: 'user', content: originalText };
  }
  const n = prepared.imageBlocks.length;
  const pathsStr = prepared.tempPaths.join(', ');
  const note = opts.withVision
    ? `\n\n[附图 ${n} 张；如需上传/插入某处，用 run_lark_cli 配路径: ${pathsStr}]`
    : `\n\n[附图 ${n} 张；当前模型无法识别图片内容。如需上传/插入这张图，用 run_lark_cli 配路径: ${pathsStr}；若被问图片内容，请说明你看不到]`;
  const fullText = `${originalText}${note}`;
  if (!opts.withVision) {
    return { role: 'user', content: fullText };
  }
  return { role: 'user', content: [{ type: 'text', text: fullText }, ...prepared.imageBlocks] };
}

/**
 * Return a copy of `messages` with image content blocks removed and every
 * message's content flattened back to a string. Run before sessionMgr.save so
 * the DB never stores base64 and SessionManager.truncate (which assumes string
 * content) never sees array content.
 */
export function stripImagesForPersist(messages: LlmMessage[]): PersistedMessage[] {
  return messages.map((m) => {
    if (typeof m.content === 'string') return m as PersistedMessage;
    const text = m.content
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return { ...m, content: text };
  });
}

/**
 * Did the LLM reject the request with a 400 — the shape "model can't read
 * images" takes on OpenAI-compatible APIs? Conservative: only 400, so
 * transient / network / rate-limit errors never trigger the vision fallback.
 */
export function isVisionRejection(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { status?: unknown }).status === 400);
}

/**
 * Run `run()`; if it rejects with a 400 vision-rejection AND images were
 * attached, run `fallback()` once (e.g. the same loop rebuilt without vision
 * blocks). Any other error — or a failure of the fallback itself — propagates.
 * Factored out of AgentRuntime so the fallback is unit-testable without the
 * heavy channel/DB constructor.
 */
export async function runWithVisionFallback<T>(args: {
  run: () => Promise<T>;
  fallback: () => Promise<T>;
  /** Whether the run() input actually carried image blocks. */
  hasImages: boolean;
  onRetry?: () => void;
}): Promise<T> {
  try {
    return await args.run();
  } catch (err) {
    if (args.hasImages && isVisionRejection(err)) {
      args.onRetry?.();
      return await args.fallback();
    }
    throw err;
  }
}

/** Delete this turn's temp image files. Never throws. */
export async function cleanupTempPaths(paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => unlink(p).catch(() => {})));
}

// -----------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------

/** Resize for the vision embed: long edge ≤ MAX_IMAGE_DIM, re-encode JPEG q80,
 *  downscale only. Falls back to the original bytes (original mime) if sharp
 *  can't process the image — vision embed is best-effort. */
async function prepareEmbedBlock(buffer: Buffer, mime: string): Promise<ContentBlock> {
  let embedBuf = buffer;
  let embedMime = mime;
  try {
    embedBuf = await sharp(buffer)
      .resize({
        width: MAX_IMAGE_DIM,
        height: MAX_IMAGE_DIM,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    embedMime = 'image/jpeg';
  } catch (err: any) {
    log.warn(`resize failed, embedding original: ${err?.message ?? err}`);
  }
  return {
    type: 'image_url',
    image_url: { url: `data:${embedMime};base64,${embedBuf.toString('base64')}` }
  };
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'jpg';
  }
}
