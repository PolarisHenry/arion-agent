// ============================================================
// Quote handling — let agents read the message a user replied to.
//
// Feishu reply/quote messages carry ONLY the new reply text in
// `content`; the quoted message is referenced by `parent_id`
// (exposed on NormalizedMessage as `replyToMessageId`) and must be
// fetched separately via `im.v1.message.get`. Without this, a user
// who replies "这个怎么处理？" to an earlier message leaves the agent
// with no idea what "这个" refers to.
//
// Mirrors the image pipeline (./image.ts): a best-effort async fetch
// that never throws, feeding a pure text assembler. Quote resolution
// must never break a turn — a missing/forbidden quote degrades to the
// plain reply text, exactly like image ingest degrades to text-only.
// ============================================================

import type { LarkChannel, NormalizedMessage, ResourceDescriptor } from '@larksuite/channel';
import { createLogger } from './logger';

const log = createLogger('quote');

/** Safety cap so a quoted giant-message can't blow the model's context window. */
export const MAX_QUOTE_CHARS = 2000;

export type QuotedContent = {
  /** Trimmed text of the quoted message. May be empty (e.g. image/card message). */
  content: string;
  /** Display name of the quoted message's sender, when the SDK resolved one. */
  senderName?: string;
  /** The quoted message's id — needed to download its media resources. */
  messageId: string;
  /** The quoted message's resources (images/files), if any. */
  resources: ResourceDescriptor[];
};

/**
 * Best-effort: resolve the message this turn is replying to / quoting and
 * return its text content. Feishu reply events reference the quoted message by
 * `parent_id` (→ `msg.replyToMessageId`); `channel.fetchMessage` is the SDK
 * method documented for exactly this resolution. Returns null when there is no
 * quote, the fetch yields nothing, or the fetch errors — never throws.
 *
 * No `rootId`/`raw` fallback: `rootId` is the thread ROOT, not the immediately
 * quoted message (would fetch the wrong text in a multi-reply thread), and
 * `msg.raw` is only populated when the channel is created with `includeRaw`,
 * which arion-agent does not set.
 */
export async function resolveQuotedContent(
  channel: LarkChannel,
  msg: NormalizedMessage
): Promise<QuotedContent | null> {
  const quoteId = msg.replyToMessageId;
  if (!quoteId) return null;
  try {
    const quoted = await channel.fetchMessage(quoteId);
    if (!quoted) return null;
    return {
      content: (quoted.content ?? '').trim(),
      senderName: quoted.senderName,
      messageId: quoted.messageId,
      resources: quoted.resources ?? []
    };
  } catch (err: any) {
    log.warn(`failed to resolve quoted message ${quoteId}: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Pure: prepend a `[引用消息]` block carrying the quoted content before the
 * user's reply text. Mirrors the `[附图]` note convention in image.ts so the
 * model sees a consistent in-band annotation for non-text context. Returns
 * `replyText` unchanged when there is no quote or the quote has no text.
 *
 * Unit-testable; the channel fetch lives in {@link resolveQuotedContent}.
 */
export function withQuotedMessage(
  quoted: { content: string; senderName?: string } | null,
  replyText: string
): string {
  if (!quoted) return replyText;
  const body = quoted.content.trim();
  if (!body) return replyText;
  const owner = quoted.senderName ? `${quoted.senderName} 的` : '';
  const trimmed = body.slice(0, MAX_QUOTE_CHARS);
  const truncated = body.length > MAX_QUOTE_CHARS ? '…（已截断）' : '';
  return `[引用${owner}消息]\n${trimmed}${truncated}\n\n${replyText}`;
}
