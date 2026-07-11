import { prisma } from '../../shared/lib/database';
import { CardStatusResponse, KycStatus, CardStatus } from '../models/types';
import { getStoredJwt } from './gnosisPayService';

// ── GET /api/card/status ───────────────────────────────────────────────────────

export async function getCardStatus(userId: string): Promise<CardStatusResponse> {
  const [kycApp, cardAccount, cardWallet] = await Promise.all([
    prisma.cardKycApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.cardAccount.findFirst({
      where: { userId, status: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.cardWallet.findUnique({ where: { userId } }),
  ]);

  // Daily spend
  const today = new Date().toISOString().split('T')[0]!;

  // Monthly spend: sum all cleared/authorized transactions this calendar month
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [dailySpend, monthlySpendResult] = await Promise.all([
    prisma.cardDailySpend.findUnique({
      where: { userId_date: { userId, date: today } },
      select: { spentUsdc: true },
    }),
    prisma.cardTransaction.aggregate({
      where: {
        userId,
        status: { in: ['authorized', 'cleared'] },
        authorizedAt: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
  ]);

  const kycStatus = resolveKycStatus(cardWallet?.gpKycStatus ?? kycApp?.status ?? null);
  const cardStatus = resolveCardStatus(cardAccount?.status ?? null, !!cardAccount);

  // GP JWT validity
  const gpSessionActive = !!(await getStoredJwt(userId));

  return {
    onboarding: {
      termsAccepted: cardWallet?.gpTermsAccepted ?? false,
      kycStatus,
      phoneVerified: cardWallet?.gpPhoneVerified ?? false,
      sofCompleted: cardWallet?.gpSofCompleted ?? false,
      safeDeployed: (cardWallet?.gpAccountStatus ?? -1) === 0,
    },
    kyc: {
      status: kycStatus,
      submittedAt: kycApp?.submittedAt?.toISOString(),
      reviewedAt: kycApp?.reviewedAt?.toISOString(),
      rejectionReason: kycApp?.rejectionReason ?? undefined,
    },
    card: {
      status: cardStatus,
      last4: cardAccount?.last4 ?? undefined,
      expiryMmYy: cardAccount?.expiryMonth && cardAccount?.expiryYear
        ? `${String(cardAccount.expiryMonth).padStart(2, '0')}/${String(cardAccount.expiryYear).slice(-2)}`
        : undefined,
      isVirtual: cardAccount?.isVirtual ?? false,
      isPhysical: cardAccount?.isPhysical ?? false,
      frozenAt: cardAccount?.frozenAt?.toISOString(),
    },
    spending: {
      dailyLimit: cardAccount?.dailyLimitEure ?? 500,
      dailySpent: dailySpend?.spentUsdc ?? 0,
      monthlyLimit: cardAccount?.monthlyLimitEure ?? 5000,
      monthlySpent: monthlySpendResult._sum.amount ?? 0,
      currency: cardAccount?.currency ?? cardWallet?.gpCurrency ?? 'EURe',
    },
    wallet: {
      eoaAddress: cardWallet?.address ?? undefined,
      safeAddress: cardWallet?.gpSafeAddress ?? undefined,
      currency: cardWallet?.gpCurrency ?? undefined,
      gpSessionActive,
    },
  };
}

// ── KYC Application record ─────────────────────────────────────────────────────

export async function upsertKycApplication(userId: string, status: KycStatus): Promise<void> {
  await prisma.cardKycApplication.upsert({
    where: { providerSessionId: `gp-${userId}` },
    create: {
      userId,
      provider: 'gnosispay',
      providerSessionId: `gp-${userId}`,
      status,
      submittedAt: new Date(),
    },
    update: {
      status,
      ...(status === 'approved' ? { reviewedAt: new Date() } : {}),
    },
  });
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function resolveKycStatus(raw: string | null): KycStatus {
  if (!raw) return 'not_started';
  const map: Record<string, KycStatus> = {
    not_started:     'not_started',
    notStarted:      'not_started',
    pending:         'pending',
    processing:      'pending',
    documentsRequested: 'pending',
    approved:        'approved',
    rejected:        'rejected',
    resubmissionRequested: 'pending',
    requiresAction:  'under_review',
    under_review:    'under_review',
    abandoned:       'abandoned',
    expired:         'expired',
  };
  return map[raw] ?? 'pending';
}

function resolveCardStatus(raw: string | null, hasCard: boolean): CardStatus {
  if (!hasCard) return 'unavailable';
  const map: Record<string, CardStatus> = {
    applying:  'applying',
    issued:    'issued',
    active:    'active',
    frozen:    'frozen',
    cancelled: 'cancelled',
  };
  return map[raw ?? ''] ?? 'applying';
}
