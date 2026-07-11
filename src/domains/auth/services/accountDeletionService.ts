import { PlaidAccountService } from '../../plaid/services/plaidAccountService';
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
    await PlaidAccountService.revokeAllItemsForUser(userId);
  }
}
