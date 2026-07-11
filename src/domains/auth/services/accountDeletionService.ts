import { prisma } from '../../shared/lib/prisma';
import { appLogger, logDebug } from '../../logger';
import { createPlaidClientForUser } from '../../plaid/lib/plaidClientFactory';
import { PlaidAuthService } from '../../plaid/services/plaidAuthService';
import { StripeService } from '../../stripe/services/stripeService';
import { deletePrivyUser } from './privyService';

/**
 * 帳號刪除前的外部服務清理（best-effort，失敗不阻擋 DB 刪除）。
 */
export class AccountDeletionService {
  static async purgeExternalIntegrations(userId: string, privyUserId: string | null): Promise<void> {
    await Promise.all([
      this.revokeAllPlaidItems(userId),
      StripeService.cancelActiveSubscriptionsForUser(userId),
    ]);
    await deletePrivyUser(privyUserId);
  }

  private static async revokeAllPlaidItems(userId: string): Promise<void> {
    const items = await prisma.plaidItem.findMany({
      where: { userId },
      select: { id: true, accessToken: true, itemId: true, institutionName: true },
    });

    if (items.length === 0) {
      return;
    }

    const plaidClient = createPlaidClientForUser(userId);

    for (const item of items) {
      try {
        const { decryptedAccessToken } = PlaidAuthService.decryptPlaidItem({
          accessToken: item.accessToken,
          itemId: item.itemId,
        });
        await plaidClient.itemRemove({ access_token: decryptedAccessToken });
        logDebug('Plaid itemRemove succeeded during account deletion', {
          userId,
          plaidItemId: item.id,
          institution: item.institutionName,
        });
      } catch (error) {
        appLogger.warn('Plaid itemRemove failed during account deletion', {
          userId,
          plaidItemId: item.id,
          institution: item.institutionName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
