import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
/**
 * Auth Controller - Request/Response Handling
 */
/**
 * 第一步：请求注册Token (已整合到邮件验证)
 * 现在发送验证码Email而不是返回token
 */
export declare const requestRegisterToken: (req: Request, res: Response) => Promise<void>;
/**
 * 第二步：使用Token确认注册
 */
export declare const confirmRegister: (req: Request, res: Response) => Promise<void>;
export declare const login: (req: Request, res: Response) => Promise<void>;
export declare const me: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateProfile: (req: AuthRequest, res: Response) => Promise<void>;
export declare const requestPasswordReset: (req: Request, res: Response) => Promise<void>;
export declare const resetPassword: (req: Request, res: Response) => Promise<void>;
export declare const deleteAccount: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 专门修改头像 API - 接收 Base64 編碼的圖片
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
 * 重新發送驗證碼 (用於已註冊但未驗證的用戶)
 */
export declare const resendVerificationCode: (req: Request, res: Response) => Promise<void>;
/**
 * 請求修改郵箱 - 發送驗證碼到新郵箱
 */
export declare const requestEmailChange: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 確認修改郵箱 - 驗證碼驗證成功則修改郵箱
 */
export declare const confirmEmailChange: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=authController.d.ts.map