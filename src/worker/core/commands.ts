// ============================================================
// /clear command — parse + execute. Intercepted at the top of
// AgentRuntime.handleMessage so it never reaches the LLM.
// ============================================================

import { createLogger } from './logger';

const log = createLogger('commands');

export const CLEAR_CONFIRMATION_TEXT = '🧹 上下文已清空，我们重新开始吧。';

/** Recognize the /clear command. Exact match (after trim + lowercase) so
 *  lookalikes like "/clearing" or "/clear 一下" fall through to the LLM. */
export function parseCommand(content: string): 'clear' | null {
  return content.trim().toLowerCase() === '/clear' ? 'clear' : null;
}

/** Wipe the chat's session and send the confirmation. `sessionMgr.clear` errors
 *  propagate (the command genuinely failed); a failed confirmation send is
 *  caught — the context is already cleared, so we must not throw to the caller
 *  (matches the defensive send pattern used throughout agent-runtime.ts). */
export async function executeClearCommand(
  sessionMgr: { clear: (chatId: string) => Promise<void> },
  channel: { send: (chatId: string, body: { markdown: string }) => Promise<unknown> },
  chatId: string
): Promise<void> {
  await sessionMgr.clear(chatId);
  try {
    await channel.send(chatId, { markdown: CLEAR_CONFIRMATION_TEXT });
  } catch (err: any) {
    log.warn(`clear confirmation send failed for ${chatId}: ${err?.message ?? err}`);
  }
}
