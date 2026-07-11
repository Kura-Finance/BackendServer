/**
 * Plaid 驗證服務
 * 處理權杖建立、交換與憑證管理
 */
export declare class PlaidAuthService {
    /**
     * 建立 Link 權杖
     */
    static createLinkToken(userId: string): Promise<string>;
    /**
     * 交換 Public Token 為 Access Token
     */
    static exchangePublicToken(userId: string, publicToken: string, institutionName?: string): Promise<void>;
    /**
     * 解密 Plaid Item 的存取權杖
     */
    static decryptPlaidItem(item: {
        accessToken: string;
        itemId: string;
    }): {
        decryptedAccessToken: string;
        decryptedItemId: string;
    };
}
//# sourceMappingURL=plaidAuthService.d.ts.map