// ============================================================
// /clear command — parse + execute. Intercepted at the top of
// AgentRuntime.handleMessage so it never reaches the LLM.
// ============================================================

import { createLogger } from './logger';

const log = createLogger('commands');

export const CLEAR_CONFIRMATION_TEXT = '🧹 上下文已清空，我们重新开始吧。';
export const STOP_CONFIRMATION_TEXT = '🛑 已停止。可补充信息继续纠正方向。';
export const NO_RUNNING_TURN_TEXT = '当前没有正在进行的对话。';

/** Recognize the /clear or /stop command. Exact match (after trim + lowercase)
 *  so lookalikes like "/clearing" or "/stop 一下" fall through to the LLM. */
export function parseCommand(content: string): 'clear' | 'stop' | null {
  const c = content.trim().toLowerCase();
  if (c === '/clear') return 'clear';
  if (c === '/stop') return 'stop';
  return null;
}

/** Wipe the chat's session and send the confirmation. `sessionMgr.clear` errors
 *  propagate (the command genuinely failed); a failed confirmation send is
 *  caught — the context is already cleared, so we must not throw to the caller
 *  (matches the defensive send pattern used throughout agent-runtime.ts). */
export async function executeClearCommand(
  sessionMgr: { clear: (chatId: string) => Promise<void> },
  channel: { sendText: (chatId: string, text: string) => Promise<unknown> },
  chatId: string
): Promise<void> {
  await sessionMgr.clear(chatId);
  try {
    await channel.sendText(chatId, CLEAR_CONFIRMATION_TEXT);
  } catch (err: any) {
    log.warn(`clear confirmation send failed for ${chatId}: ${err?.message ?? err}`);
  }
}
