/**
 * Dinari（tokenized stocks / dShares）對外型別
 *
 * 模型：User → DinariEntity → DinariAccount（連用戶 SCA）→ DinariOrder
 * 下單為自管錢包模式，走鏈上 EIP155 permit：
 *   1. prepare：後端產生 permit（要簽的 typed data）
 *   2. 用戶 SCA 簽 permit → permit_signature
 *   3. submit：後端送出 → 產生 on-chain order
 */

export type DinariOrderSide = 'BUY' | 'SELL';
export type DinariOrderType = 'MARKET' | 'LIMIT';
export type DinariOrderTif = 'DAY' | 'GTC' | 'IOC' | 'FOK';

// Dinari KYC 狀態：PASS | FAIL | PENDING | INCOMPLETE | NEEDS_REVIEW
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

// 下單第一步：回給前端讓用戶 SCA 簽章
export interface PrepareOrderResult {
  orderRequestId: string;
  // Dinari 回傳的 EIP-712 typed data（原樣交給錢包簽）
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

// 市價單下單參數（自管錢包）
export interface PrepareMarketOrderParams {
  side: DinariOrderSide;
  stockId: string;
  // 市價買：用穩定幣金額；市價賣：用 dShare 數量
  paymentTokenQuantity?: number;
  assetTokenQuantity?: number;
  clientOrderId?: string;
}
