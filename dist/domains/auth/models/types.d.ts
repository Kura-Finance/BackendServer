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
    plaidCache?: PlaidCacheInfo;
}
export interface UpdateProfilePayload {
    displayName?: string;
    avatarUrl?: string;
    avatarBase64?: string;
}
//# sourceMappingURL=types.d.ts.map