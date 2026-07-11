/**
 * SRP 控制器
 * 處理 SRP 零知識認證的 HTTP 請求
 */
import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
/**
 * POST /api/auth/srp/salt
 * 取得使用者的 salt（不需要認證，salt 本身是公開的）
 * 用戶端使用 salt + 密碼推導 Master Key
 */
export declare const srpGetSalt: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/auth/srp/challenge
 * SRP 登入階段 1：用戶端傳入 A，伺服器回傳 B + salt
 */
export declare const srpChallenge: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/auth/srp/verify
 * SRP 登入階段 2：用戶端傳入 M1，伺服器驗證並回傳 M2 + JWT token
 */
export declare const srpVerify: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/auth/srp/setup
 * 為現有帳號設定 SRP（需要已登入）
 * 用戶端在本地完成金鑰推導（key derivation）後，上傳 verifier 與加密後的 Data Key
 *
 * 請求本文 Body：{ srpSalt, srpVerifier, encryptedDataKey, kekSalt }
 * - srpSalt: Argon2id salt（hex），用於用戶端推導 Master Key
 * - srpVerifier: SRP 驗證值 verifier（hex），伺服器儲存，不可反推密碼
 * - encryptedDataKey: AES-GCM(DataKey, KEK)，伺服器無法解密
 * - kekSalt: KEK 推導用 salt
 */
export declare const srpSetup: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * GET /api/auth/srp/data-key
 * 取得已登入使用者的加密 Data Key
 * 用戶端使用 KEK 解密後使用
 */
export declare const srpDataKey: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=srpController.d.ts.map