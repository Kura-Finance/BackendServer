/**
 * E2EE Reset Service (new device / replace Passkey).
 *
 * When the user loses their passkey after switching devices:
 *   - encryptedPrivateKey is wrapped with a KEK from the old passkey PRF → unreadable on the new device
 *   - Business-cache wrappedSek values are sealed to the old publicKey → dead after keypair rotate
 * Protected data (Plaid / exchange / DeBank caches) can be re-synced, so the cleanest
 * passkey replacement is to wipe and rebuild the whole E2EE layer.
 *
 * This service clears only the crypto layer:
 *   - All passkey credentials + in-flight WebAuthn challenges
 *   - User keypair (publicKey / encryptedPrivateKey / kekSalt)
 *   - All EncryptedPayloadKey (wrappedSek)
 *   - All zero-access encrypted caches + AssetSnapshot history
 *   - Plaid sync state (next read re-fetches)
 *
 * Plaid links are revoked (itemRemove + delete PlaidItem); user must re-Link.
 * Exchange connections (ExchangeAccount.apiKey/apiSecret) are kept.
 *
 * Auth: caller must be Privy-logged-in (requireAuth). No old passkey assertion —
 * the user lost the passkey; Privy login is sufficient identity proof.
 */

import { prisma } from '../../shared/lib/prisma';
import { logBusinessEvent, logDebug } from '../../logger';
import { PlaidAccountService } from '../../plaid/services/plaidAccountService';

export interface E2EEResetResult {
  passkeysDeleted: number;
  payloadKeysDeleted: number;
  plaidItemsRevoked: number;
  cachesCleared: Record<string, number>;
}

export class E2EEResetService {
  static async resetForUser(userId: string): Promise<E2EEResetResult> {
    const { revoked: plaidItemsRevoked } = await PlaidAccountService.revokeAllItemsForUser(userId);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Clear zero-access encrypted caches (re-syncable)
      const [
        plaidAccounts,
        plaidTransactions,
        plaidInvestmentAccounts,
        plaidInvestments,
        exchangeCaches,
        debankCaches,
        assetSnapshots,
      ] = await Promise.all([
        tx.plaidAccountCache.deleteMany({ where: { userId } }),
        tx.plaidTransactionCache.deleteMany({ where: { userId } }),
        tx.plaidInvestmentAccountCache.deleteMany({ where: { userId } }),
        tx.plaidInvestmentCache.deleteMany({ where: { userId } }),
        tx.exchangeCache.deleteMany({ where: { userId } }),
        tx.deBankCache.deleteMany({ where: { userId } }),
        tx.assetSnapshot.deleteMany({ where: { userId } }),
      ]);

      // 2. Clear payload keys (wrappedSek sealed to old publicKey)
      const payloadKeys = await tx.encryptedPayloadKey.deleteMany({ where: { userId } });

      // 3. Reset Plaid sync state so next read re-encrypts with new keypair
      await tx.plaidSyncLog.deleteMany({ where: { userId } });

      // 4. Clear passkeys + in-flight challenges
      const passkeys = await tx.passkeyCredential.deleteMany({ where: { userId } });
      await tx.webAuthnChallenge.deleteMany({ where: { userId } });

      // 5. Clear user keypair → unconfigured state
      await tx.user.update({
        where: { id: userId },
        data: {
          publicKey: null,
          encryptedPrivateKey: null,
          kekSalt: null,
          keyPairCreatedAt: null,
        },
      });

      return {
        passkeysDeleted: passkeys.count,
        payloadKeysDeleted: payloadKeys.count,
        cachesCleared: {
          plaidAccounts: plaidAccounts.count,
          plaidTransactions: plaidTransactions.count,
          plaidInvestmentAccounts: plaidInvestmentAccounts.count,
          plaidInvestments: plaidInvestments.count,
          exchangeCaches: exchangeCaches.count,
          debankCaches: debankCaches.count,
          assetSnapshots: assetSnapshots.count,
        },
      };
    });

    logBusinessEvent('e2ee_reset', userId, {
      passkeysDeleted: result.passkeysDeleted,
      payloadKeysDeleted: result.payloadKeysDeleted,
      plaidItemsRevoked,
    });
    logDebug('E2EE layer reset for user', { userId, plaidItemsRevoked, ...result });

    return { ...result, plaidItemsRevoked };
  }
}
