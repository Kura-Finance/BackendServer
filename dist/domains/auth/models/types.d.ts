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
    plaidCache?: PlaidCacheInfo;
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
    avatarBase64?: string;
}
export interface AuthResponse {
    token: string;
    user: UserProfile;
}
//# sourceMappingURL=types.d.ts.map