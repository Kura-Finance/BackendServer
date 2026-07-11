/**
 * SRP（安全遠端密碼）服務
 *
 * 使用 SRP-6a 協議讓使用者登入時密碼永不傳送到伺服器。
 * 伺服器只存 verifier（無法反推密碼）。
 *
 * tssrp6a 函式介面：
 *   step1(identifier, salt, verifier) → 伺服器第一階段會話結果
 *   step1Result.step2(clientA)        → 伺服器第二階段會話結果
 *   step2Result.step3(clientM1)       → { M2 }
 */
export declare class SRPService {
    /**
     * 儲存 SRP verifier + per-user Data Key
     */
    static storeVerifier(userId: string, srpSalt: string, srpVerifier: string, encryptedDataKey: string, kekSalt: string): Promise<void>;
    /**
     * 登入階段 1：用戶端傳 email → 後端產生 session，回傳 salt + B
     * clientA 不在此階段接收，改在 srpVerify 一起驗證
     */
    static srpChallenge(email: string): Promise<{
        sessionId: string;
        srpSalt: string;
        serverB: string;
        kekSalt: string;
        encryptedDataKey: string;
    }>;
    /**
     * 登入階段 2：用戶端傳 clientA + M1 → 後端驗證並回傳 M2
     * clientA 在此階段接收（與 M1 一起），而非在 challenge 階段
     */
    static srpVerify(sessionId: string, clientA: string, clientM1: string): Promise<{
        userId: string;
        serverM2: string;
    }>;
    /**
     * 取得 email 對應的 salt（公開，不需身份驗證）
     * 若帳號不存在，回傳穩定的假 salt（HMAC 確保同一 email 永遠回傳相同假 salt）
     * 防止攻擊者用「每次 salt 不同」推斷帳號存在與否
     */
    static getSaltForEmail(email: string): Promise<{
        srpSalt: string;
        kekSalt: string;
        srpEnabled: boolean;
    } | null>;
    /**
     * 為不存在帳號生成穩定的假 salt（HMAC-SHA256）
     * 同一 email 永遠回傳相同假 salt，但無法反推任何真實資料
     */
    static generateStableFakeSalt(email: string, purpose: 'srp' | 'kek'): string;
}
//# sourceMappingURL=srpService.d.ts.map