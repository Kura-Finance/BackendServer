/**
 * Auth Domain Model Types
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
  displayName: string;
  avatarUrl: string;
  membershipLabel: string;
  plaidCache?: PlaidCacheInfo; // 可选的 Plaid 缓存统计信息
}

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface UpdateProfilePayload {
  displayName?: string;
  avatarUrl?: string;
  avatarBase64?: string;  // Base64 編碼的圖片數據 (data:image/...;base64,...)
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}
