/**
 * Dinari (tokenized stocks / dShares) public types.
 *
 * Model: User → DinariEntity → DinariAccount (linked user SCA) → DinariOrder.
 * Orders use self-custodial EIP-155 permit flow:
 *   1. prepare — backend builds permit (typed data to sign)
 *   2. user SCA signs permit → permit_signature
 *   3. submit — backend submits → on-chain order
 */

export type DinariOrderSide = 'BUY' | 'SELL';
export type DinariOrderType = 'MARKET' | 'LIMIT';
export type DinariOrderTif = 'DAY' | 'GTC' | 'IOC' | 'FOK';

// Dinari KYC status: PASS | FAIL | PENDING | INCOMPLETE | NEEDS_REVIEW
export type DinariKycStatus = string;

export interface DinariEntityStatus {
  entityId: string;
  kycStatus: DinariKycStatus;
  canTransact: boolean; // kycStatus === 'PASS'
}

export interface KycEmbedResult {
  embedUrl: string;
  expiresAt: string;
}

export interface DinariAccountResult {
  accountId: string;
  walletAddress: string | null;
  walletChainId: string | null;
  isActive: boolean;
}

export interface WalletNonceResult {
  nonce: string;
  message: string;
  chainId: string;
  walletAddress: string;
}

// Step 1: return permit for the user SCA to sign
export interface PrepareOrderResult {
  orderRequestId: string;
  // EIP-712 typed data from Dinari (pass through to wallet)
  permit: Record<string, unknown>;
}

export interface DinariOrderResult {
  orderRequestId: string;
  orderId: string | null;
  status: string;
  side: DinariOrderSide;
  type: DinariOrderType;
  tif: DinariOrderTif;
  stockId: string | null;
  paymentTokenQuantity: string | null;
  assetTokenQuantity: string | null;
  limitPrice: string | null;
  chainId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Market order params (self-custodial wallet)
export interface PrepareMarketOrderParams {
  side: DinariOrderSide;
  stockId: string;
  // Market BUY: stablecoin amount; market SELL: dShare quantity
  paymentTokenQuantity?: number;
  assetTokenQuantity?: number;
  clientOrderId?: string;
}
