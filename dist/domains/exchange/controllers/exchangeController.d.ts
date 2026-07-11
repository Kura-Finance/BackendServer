import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
/**
 * 連結交易所帳戶
 * 受用戶等級限制：每天最多連接次數
 */
export declare const connectExchange: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 取得交易所餘額和資產（Phase 3 Zero-Access E2EE only）。
 *
 * 路由：GET /api/exchange/:exchangeAccountId/balances
 *
 * - 觸發 CCXT 同步 → 加密寫快取 → 回傳加密形式 snapshot
 * - 達到查詢上限時，回退讀加密快取（不再呼叫 CCXT）
 * - 後端不解密任何敏感欄位；前端用 privateKey unwrap payloadKeys 後解 row
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