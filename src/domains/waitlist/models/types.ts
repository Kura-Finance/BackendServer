/**
 * Waitlist request/response DTOs and default product slug.
 */

export const WAITLIST_DEFAULT_PRODUCT = 'default';

export interface JoinWaitlistParams {
  email: string;
  product?: string;
  name?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface WaitlistEntryResult {
  id: string;
  email: string;
  product: string;
  name: string | null;
  source: string | null;
  createdAt: string;
}

export interface JoinWaitlistResult {
  entry: WaitlistEntryResult;
  alreadyJoined: boolean;
}

export interface WaitlistStatusResult {
  joined: boolean;
  entry: WaitlistEntryResult | null;
}

export interface WaitlistCountResult {
  count: number;
  product: string | null;
}
