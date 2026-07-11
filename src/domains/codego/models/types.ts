/**
 * Codego Visa/Mastercard Card Issuing
 * @see https://developers.codegotech.com/visa-crypto-card.html
 */

export type CodegoApplicantType = 'individual' | 'company';

export interface CreateKycSessionParams {
  applicantType?: CodegoApplicantType;
  email?: string;
  origin?: string;
  locale?: string;
  returnUrl?: string;
  resumeSessionId?: string;
}

export interface CodegoKycSessionResponse {
  sessionId: string;
  iframeUrl: string;
  expiresAt?: string;
  resume?: string;
}

export interface CodegoCardholderStatusResult {
  codegoUserId: string | null;
  externalUserId: string;
  applicantType: CodegoApplicantType;
  kycSessionId: string | null;
  iframeUrl: string | null;
  sessionExpiresAt: string | null;
  applicationStatus: string | null;
  applicationReason: string | null;
  kycStatus: string | null;
  canIssueCard: boolean;
}

export interface IssueCardParams {
  cardType?: 'virtual' | 'physical';
  [key: string]: unknown;
}

export interface UpdateCardParams {
  status?: string;
  [key: string]: unknown;
}

export interface CodegoWebhookPayload {
  type: string;
  body?: Record<string, unknown>;
}

export interface CodegoUserUpdatedBody {
  id?: string;
  externalUserId?: string;
  applicationStatus?: string;
  applicationReason?: string;
  kycStatus?: string;
  createdAt?: string;
}
