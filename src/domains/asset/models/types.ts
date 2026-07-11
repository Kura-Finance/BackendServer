/**
 * Asset Domain Model Types
 */

export interface AssetSnapshotData {
  assetId: string;
  name: string;
  type: 'bank_account' | 'investment' | 'crypto_wallet';
  value: number;
  currency?: string;
  recordedAt?: Date;
}

export interface AssetSnapshotResponse {
  id: string;
  assetId: string;
  name: string;
  type: string;
  value: number;
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
  value: number;
  assetId: string;
  name: string;
  type: string;
}

export interface AssetHistoryResponse {
  userId: string;
  totalAssets: number;
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
