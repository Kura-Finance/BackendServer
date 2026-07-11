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
  email: string | null;
  walletAddress?: string | null;
  displayName: string;
  /** true 當 displayName 來自用戶主動設定的 name 欄位（非 fallback） */
  hasName: boolean;
  avatarUrl: string;
  membershipLabel: string;
  referCode?: string;
  referredByCode?: string | null;
  referralCount?: number;
  cashbackBalance?: number;
  plaidCache?: PlaidCacheInfo;
}

export interface UpdateProfilePayload {
  displayName?: string;
  avatarUrl?: string;
  avatarBase64?: string;  // Base64 編碼的圖片數據 (data:image/...;base64,...)
}
