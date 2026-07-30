/**
 * LI.FI analytics transfer types (trimmed StatusResponse for Investor accounting).
 */

export interface LifiFeeCost {
  name?: string;
  description?: string;
  amountUSD?: string;
  included?: boolean;
}

export interface LifiTransactionInfo {
  txHash?: string;
  amount?: string;
  amountUSD?: string;
  chainId?: number;
  timestamp?: number;
  token?: {
    symbol?: string;
    address?: string;
    decimals?: number;
    priceUSD?: string;
  };
}

export interface LifiTransferStatus {
  status?: string;
  substatus?: string;
  tool?: string;
  transactionId?: string;
  fromAddress?: string;
  toAddress?: string;
  lifiExplorerLink?: string;
  sending?: LifiTransactionInfo;
  receiving?: LifiTransactionInfo;
  feeCosts?: LifiFeeCost[];
  metadata?: { integrator?: string };
}

export interface LifiTransfersSyncResult {
  syncRunId: string;
  transferred: number;
  periodFrom: string;
  periodTo: string;
  /** Integrators used for this fetch. */
  integrators: string[];
}

export interface LifiTransfersSummary {
  transferCount: number;
  processUsd: number;
  platformFeeUsd: number;
  periodFrom: string;
  periodTo: string;
  lastSyncedAt: string | null;
}
