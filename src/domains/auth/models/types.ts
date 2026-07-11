/**
 * Auth 領域模型型別
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
  plaidCache?: PlaidCacheInfo; // 可選的 Plaid 快取統計資訊
}

export interface UpdateProfilePayload {
  displayName?: string;
  avatarUrl?: string;
  avatarBase64?: string;  // Base64 編碼的圖片數據 (data:image/...;base64,...)
}
