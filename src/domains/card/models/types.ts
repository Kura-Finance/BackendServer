// ── KYC ──────────────────────────────────────────────────────────────────────

export type KycStatus =
  | 'not_started'
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'abandoned'
  | 'expired';

export interface KycInfo {
  status: KycStatus;
  submittedAt?: string | undefined;
  reviewedAt?: string | undefined;
  rejectionReason?: string | undefined;
}

// ── Card ─────────────────────────────────────────────────────────────────────

export type CardStatus = 'unavailable' | 'applying' | 'issued' | 'active' | 'frozen' | 'cancelled';

export interface CardInfo {
  status: CardStatus;
  last4?: string | undefined;
  expiryMmYy?: string | undefined;
  isVirtual: boolean;
  isPhysical: boolean;
  frozenAt?: string | undefined;
}

// ── Spending ──────────────────────────────────────────────────────────────────

export interface SpendingInfo {
  dailyLimit: number;
  dailySpent: number;
  monthlyLimit: number;
  monthlySpent: number;
  currency: string; // 'EURe' | 'GBPe' | 'USDCe'
}

// ── Wallet (Gnosis Pay Safe) ──────────────────────────────────────────────────

export interface WalletInfo {
  eoaAddress?: string | undefined;    // SIWE signing wallet
  safeAddress?: string | undefined;   // GP Safe on Gnosis Chain
  currency?: string | undefined;      // EURe | GBPe | USDCe
  gpSessionActive: boolean;           // GP JWT is valid and not expired
}

// ── Onboarding state ──────────────────────────────────────────────────────────

export interface OnboardingInfo {
  termsAccepted: boolean;
  kycStatus: KycStatus;
  phoneVerified: boolean;
  sofCompleted: boolean;
  safeDeployed: boolean;
}

// ── Composite response ────────────────────────────────────────────────────────

export interface CardStatusResponse {
  onboarding: OnboardingInfo;
  kyc: KycInfo;
  card: CardInfo;
  spending: SpendingInfo;
  wallet: WalletInfo;
}

// ── Gnosis Pay webhook ────────────────────────────────────────────────────────

export interface GpWebhookPayload {
  eventType: string;
  data: Record<string, unknown>;
}

// ── Request body types ────────────────────────────────────────────────────────

export interface GpAuthBody {
  message: string;
  signature: string;
}

export interface GpPhoneSendBody {
  phone: string;
}

export interface GpPhoneVerifyBody {
  code: string;
}

export interface GpSofBody {
  sourceOfFunds: string;
  [key: string]: unknown;
}
