export interface ScaAumSummary {
  totalUsd: number;
  spotUsd: number;
  defiUsd: number;
  walletCount: number;
  lastSnapshotAt: string | null;
  lastScan: {
    id: string;
    status: string;
    walletsScanned: number;
    walletsFailed: number;
    totalAumUsd: number;
    startedAt: string;
    completedAt: string | null;
  } | null;
}
