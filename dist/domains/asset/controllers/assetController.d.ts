import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
/**
 * Asset Controller (Phase 3 Zero-Access E2EE only)
 *
 * 自 PR 5 起：legacy 明文歷史路徑已移除。所有資產歷史一律走加密路徑：
 *   - `/api/assets/history/encrypted` (canonical)
 *   - `/api/assets/history`           (legacy-compatible alias)
 * 前端用 privateKey 解 payloadKeys → 解每個 snapshot row 後組合曲線。
 */
/**
 * 取得「加密形式」資產歷史
 *
 * 路由：GET /api/assets/history/encrypted?days=30  (與 /api/assets/history 別名等價)
 *
 * 後端不解密，回傳：
 *   {
 *     userId,
 *     payloadKeys: [{ id, scope, wrappedSek, algorithm }, ...],
 *     snapshots:   [{ id, metric, recordedAt, payloadCiphertext, payloadKeyId }, ...]
 *   }
 *
 * 前端用 privateKey unwrap payloadKeys → 解每個 snapshot row 的 payloadCiphertext，
 * 自行組成 4-metric 時間序列（cashFlow / plaidInvestment / cryptoSpot / defiProtocol）。
 *
 * - metric 字串：可能是 base 或 sub-scoped（{base}:{source}:{id}）
 * - 同 sub-scoped key 同一天取 recordedAt 最大者；同 base 跨 sub-scope 加總
 */
export declare const getEncryptedAssetHistory: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 獲取所有記錄日期（用於前端日期選擇器）
 *
 * 路由：GET /api/assets/dates
 *
 * 只回傳 metadata（recordedAt），不涉及任何 payload 解密。
 */
export declare const getRecordDates: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=assetController.d.ts.map