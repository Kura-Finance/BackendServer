import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const me: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateProfile: (req: AuthRequest, res: Response) => Promise<void>;
export declare const requestPasswordReset: (req: Request, res: Response) => Promise<void>;
export declare const resetPassword: (req: Request, res: Response) => Promise<void>;
/**
 * 登出 - 清除 Cookie（網頁客戶端）
 */
export declare const logout: (req: AuthRequest, res: Response) => Promise<void>;
export declare const deleteAccount: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 專用頭像修改介面 - 接收 Base64 編碼圖片
 */
export declare const updateAvatar: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 修改顯示名稱 API
 */
export declare const updateDisplayName: (req: AuthRequest, res: Response) => Promise<void>;
export declare const sendVerificationCode: (req: Request, res: Response) => Promise<void>;
/**
 * 驗證郵箱驗證碼並完成註冊 (新註冊流程第二步)
 */
export declare const verifyEmailAndRegister: (req: Request, res: Response) => Promise<void>;
/**
 * 請求修改郵箱 - 發送驗證碼到新郵箱
 */
export declare const requestEmailChange: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 確認修改郵箱 - 驗證碼驗證成功則修改郵箱
 */
export declare const confirmEmailChange: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=authController.d.ts.map