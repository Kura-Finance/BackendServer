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
    avatarBase64?: string;
}
//# sourceMappingURL=types.d.ts.map