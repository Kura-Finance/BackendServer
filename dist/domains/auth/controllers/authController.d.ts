import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const me: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateProfile: (req: AuthRequest, res: Response) => Promise<void>;
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
export declare const applyReferralCode: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getMyCashbackHistory: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=authController.d.ts.map