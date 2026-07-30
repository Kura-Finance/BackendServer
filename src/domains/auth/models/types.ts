/**
 * Auth domain model types.
 */

export interface PlaidCacheInfo {
  accounts: number;
  transactions: number;
  investmentAccounts: number;
  investments: number;
  lastSynced: Date | null;
  accountsSynced: Date | null;
  transactionsSynced: Date | null;
  investmentsSynced: Date | null;
}

export interface UserProfile {
  id: string;
  email: string;
  /** true when email is `{userId}@placeholder.kura-finance.internal` — frontend should call Privy useLinkEmail, not useUpdateEmail */
  emailIsPlaceholder: boolean;
  walletAddress?: string | null;
  displayName: string;
  /** true when displayName comes from the user-set name field (not a fallback) */
  hasName: boolean;
  avatarUrl: string;
  membershipLabel: string;
  tier: string;
  /** true for Pro / Ultimate; Web Basic users should be sent to the paywall after login */
  webAccessAllowed: boolean;
  referCode?: string;
  referredByCode?: string | null;
  referralCount?: number;
  cashbackBalance?: number;
  plaidCache?: PlaidCacheInfo;
}

export interface UpdateProfilePayload {
  displayName?: string;
  avatarUrl?: string;
  avatarBase64?: string;  // Base64 image data (data:image/...;base64,...)
}
