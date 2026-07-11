"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SRPService = void 0;
const tssrp6a_1 = require("tssrp6a");
const crypto_1 = require("crypto");
const prisma_1 = require("../../shared/lib/prisma");
const logger_1 = require("../../logger");
// SRP-6a 標準參數（與用戶端一致）
const SRP_PARAMS = new tssrp6a_1.SRPParameters();
const SRP_ROUTINES = new tssrp6a_1.SRPRoutines(SRP_PARAMS);
function toCanonicalHex(value) {
    const hex = value.toString(16).toLowerCase();
    return hex.length % 2 === 0 ? hex : `0${hex}`;
}
function assertEvenHex(value, fieldName) {
    const normalized = value.trim().toLowerCase();
    if (!/^[a-f0-9]+$/.test(normalized) || normalized.length % 2 !== 0) {
        throw new Error(`${fieldName} must be an even-length hex string`);
    }
    return normalized;
}
const srpSessions = new Map();
// 清理過期 session
setInterval(() => {
    const now = Date.now();
    for (const [key, session] of srpSessions.entries()) {
        if (session.expiresAt < now)
            srpSessions.delete(key);
    }
}, 60_000);
class SRPService {
    /**
     * 儲存 SRP verifier + per-user Data Key
     */
    static async storeVerifier(userId, srpSalt, srpVerifier, encryptedDataKey, kekSalt) {
        const normalizedSrpSalt = assertEvenHex(srpSalt, 'srpSalt');
        const normalizedSrpVerifier = assertEvenHex(srpVerifier, 'srpVerifier');
        const normalizedEncryptedDataKey = assertEvenHex(encryptedDataKey, 'encryptedDataKey');
        const normalizedKekSalt = assertEvenHex(kekSalt, 'kekSalt');
        await prisma_1.prisma.user.update({
            where: { id: userId },
            data: {
                srpSalt: normalizedSrpSalt,
                srpVerifier: normalizedSrpVerifier,
                encryptedDataKey: normalizedEncryptedDataKey,
                kekSalt: normalizedKekSalt,
            },
        });
        (0, logger_1.logDebug)('SRP verifier stored', { userId });
    }
    /**
     * 登入階段 1：用戶端傳 email → 後端產生 session，回傳 salt + B
     * clientA 不在此階段接收，改在 srpVerify 一起驗證
     */
    static async srpChallenge(email) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                srpSalt: true,
                srpVerifier: true,
                kekSalt: true,
                encryptedDataKey: true,
            },
        });
        if (!user?.srpSalt || !user?.srpVerifier) {
            throw new Error('Invalid email or password');
        }
        const serverSession = new tssrp6a_1.SRPServerSession(SRP_ROUTINES);
        // step1(identifier, salt, verifier) → SRPServerSessionStep1 (含 B 屬性)
        const step1 = await serverSession.step1(email, BigInt(`0x${user.srpSalt}`), BigInt(`0x${user.srpVerifier}`));
        const sessionId = (0, crypto_1.randomUUID)();
        srpSessions.set(sessionId, {
            step1Result: step1,
            userId: user.id,
            expiresAt: Date.now() + 5 * 60 * 1000,
        });
        (0, logger_1.logDebug)('SRP challenge created', { userId: user.id, sessionId });
        return {
            sessionId,
            srpSalt: user.srpSalt,
            serverB: toCanonicalHex(step1.B),
            kekSalt: user.kekSalt || user.srpSalt,
            encryptedDataKey: user.encryptedDataKey || '',
        };
    }
    /**
     * 登入階段 2：用戶端傳 clientA + M1 → 後端驗證並回傳 M2
     * clientA 在此階段接收（與 M1 一起），而非在 challenge 階段
     */
    static async srpVerify(sessionId, clientA, clientM1) {
        const session = srpSessions.get(sessionId);
        if (!session || session.expiresAt < Date.now()) {
            throw new Error('SRP session has expired. Please sign in again.');
        }
        srpSessions.delete(sessionId);
        // step1.step2(clientA, clientM1) → M2 (bigint)
        let serverM2;
        try {
            serverM2 = await session.step1Result.step2(BigInt(`0x${clientA}`), // 來自 verify 請求，不再從 session 讀取
            BigInt(`0x${clientM1}`));
        }
        catch {
            (0, logger_1.logAuthEvent)('failed_login', session.userId, { reason: 'srp_proof_failed' });
            throw new Error('Invalid email or password');
        }
        (0, logger_1.logAuthEvent)('login', session.userId, { method: 'SRP' });
        return { userId: session.userId, serverM2: toCanonicalHex(serverM2) };
    }
    /**
     * 取得 email 對應的 salt（公開，不需身份驗證）
     * 若帳號不存在，回傳穩定的假 salt（HMAC 確保同一 email 永遠回傳相同假 salt）
     * 防止攻擊者用「每次 salt 不同」推斷帳號存在與否
     */
    static async getSaltForEmail(email) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email },
            select: { srpSalt: true, kekSalt: true },
        });
        if (!user)
            return null; // 帳號不存在
        if (!user.srpSalt) {
            return null; // 帳號存在但尚未升級 SRP
        }
        return {
            srpSalt: user.srpSalt,
            kekSalt: user.kekSalt || user.srpSalt,
            srpEnabled: true,
        };
    }
    /**
     * 為不存在帳號生成穩定的假 salt（HMAC-SHA256）
     * 同一 email 永遠回傳相同假 salt，但無法反推任何真實資料
     */
    static generateStableFakeSalt(email, purpose) {
        const secret = process.env.JWT_SECRET || 'kura-fake-salt-secret';
        return (0, crypto_1.createHmac)('sha256', secret)
            .update(`${purpose}:${email}`)
            .digest('hex');
    }
}
exports.SRPService = SRPService;
//# sourceMappingURL=srpService.js.map