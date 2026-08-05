import type { UserAuthStatus } from './types';

// Worker-in-progress statuses. While a row is in one of these the dashboard
// should auto-refresh to pick up the next transition. Terminal states
// (authorized / revoked / error) and "no row" are stable — polling them just
// burns requests, which is what caused the agent-detail page to poll forever.
const FLOW_ACTIVE_STATUSES: ReadonlySet<UserAuthStatus> = new Set([
  'pending_start',
  'awaiting_user',
  'completing',
  'revoking'
]);

export function isUserAuthFlowActive(status: UserAuthStatus | null | undefined): boolean {
  return !!status && FLOW_ACTIVE_STATUSES.has(status);
}
