// ============================================================
// createChannel — dispatches to the right PlatformChannel impl based
// on agent.platform. AgentRuntime calls this instead of constructing
// a Lark-specific channel directly.
// ============================================================

import { createLarkChannel } from '@larksuite/channel';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import { LarkChannelAdapter } from './lark-channel-adapter';
import { WeChatChannel } from './wechat-channel';
import type { Platform, PlatformChannel } from './channel';

/** The subset of an agent row the factory needs. `appSecret` is passed in
 *  already-decrypted — the factory never touches ciphertext. */
export type ChannelAgentRow = {
  id: string;
  platform?: string | null;
  appId: string | null;
  name: string;
};

export function createChannel(agentRow: ChannelAgentRow, appSecret: string): PlatformChannel {
  const platform = (agentRow.platform ?? 'lark') as Platform;
  switch (platform) {
    case 'lark':
      return new LarkChannelAdapter(
        createLarkChannel({
          appId: agentRow.appId ?? '',
          appSecret,
          source: `arion-agent/${agentRow.name}`,
          loggerLevel: LoggerLevel.info
        })
      );
    case 'wechat':
      return new WeChatChannel({ agentId: agentRow.id, name: agentRow.name });
    default:
      throw new Error(`unsupported platform: ${String(platform)}`);
  }
}
