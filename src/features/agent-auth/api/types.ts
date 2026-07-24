// ============================================================
// Agent User Auth — types
// ============================================================

export type UserAuthStatus =
  | 'pending_start'
  | 'awaiting_user'
  | 'completing'
  | 'authorized'
  | 'revoking'
  | 'revoked'
  | 'error';

export type AgentUserAuth = {
  id: string;
  ownerId: string;
  agentId: string;
  status: UserAuthStatus;
  deviceCode: string | null;
  verificationUrl: string | null;
  userOpenId: string | null;
  userName: string | null;
  grantedScopes: string[] | null;
  tokenExpiresAt: string | null;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserAuthAction = 'start' | 'complete' | 'revoke';
