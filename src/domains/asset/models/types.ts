/**
 * 資產領域模型型別
 *
 * NOTE: 加密只發生在 service → DB 這一層。
 * 所有 TypeScript interface 使用 number，service 負責在寫入前加密、讀取後解密。
 */

export interface AssetSnapshotData {
  assetId: string;
  name: string;
  type: 'bank_account' | 'investment' | 'crypto_wallet';
  value: number;       // plaintext；service 層負責加密後再存 DB
  currency?: string;
  recordedAt?: Date;
}

export interface AssetSnapshotResponse {
  id: string;
  assetId: string;
  name: string;
  type: string;
  value: number;       // 已解密的明文數字
  currency: string;
  recordedAt: Date;
  createdAt: Date;
}

export interface AssetPerformanceResponse {
  totalAssets: number;
  lastRecordedTime: Date | null;
  assets: AssetSnapshotResponse[];
}

export interface AssetHistoryPoint {
  timestamp: Date;
  value: number;       // 已解密的明文數字
  assetId: string;
  name: string;
  type: string;
}

export interface AssetHistoryResponse {
  userId: string;
  totalAssets: number; // 已解密的明文數字
  lastRecordedTime: Date | null;
  history: AssetHistoryPoint[];
  summary: {
    minValue: number;
    maxValue: number;
    averageValue: number;
    change: number;
    changePercent: number;
  };
}
