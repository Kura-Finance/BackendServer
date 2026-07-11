import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
/**
 * 連結交易所帳戶
 */
export declare const connectExchange: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取交易所餘額和資產 (合併端點)
 * 返回簡化的 JSON 結構: { account, balances, assets, timestamp }
 */
export declare const getExchangeBalances: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取用戶所有交易所帳戶
 */
export declare const getUserExchangeAccounts: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 斷開交易所連接
 */
export declare const disconnectExchange: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取支持的交易所列表
 */
export declare const getSupportedExchanges: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=exchangeController.d.ts.map