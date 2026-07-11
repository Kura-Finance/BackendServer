/**
 * E2EE Reset Service（換裝置 / 換 Passkey）
 *
 * 場景：使用者換裝置後遺失 passkey。由於：
 *   - encryptedPrivateKey 是用「舊裝置 passkey PRF 推導的 KEK」包的 → 新裝置解不開
 *   - 所有業務快取的 wrappedSek 是用「舊 publicKey」seal 的 → 換 keypair 後變死資料
 * 而被保護的資料（Plaid / 交易所 / DeBank 快取）都能重新同步取得，
 * 因此最乾淨的「換 passkey」方式就是把整個 E2EE 加密層砍掉重建。
 *
 * 本服務只清除「加密層」：
 *   - 所有 passkey credential + 進行中的 WebAuthn challenge
 *   - 使用者的 keypair（publicKey / encryptedPrivateKey / kekSalt）
 *   - 所有 EncryptedPayloadKey（wrappedSek）
 *   - 所有 zero-access 加密快取 + AssetSnapshot 歷史
 *   - Plaid 同步狀態（讓下次讀取重新抓資料）
 *
 * Plaid 連線會一併撤銷（itemRemove + 刪除 PlaidItem），使用者需重新走 Link 流程。
 * 交易所連線（ExchangeAccount.apiKey/apiSecret）仍保留，不需重連。
 *
 * 授權：呼叫者必須已透過 Privy 登入（requireAuth）。本流程「不」要求舊 passkey
 * assertion —— 因為用戶正是遺失了 passkey，Privy 登入即為足夠的身分證明。
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
      // 1. 清除 zero-access 加密快取（可重新同步取得）
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

      // 2. 清除 payload keys（wrappedSek，皆以舊 publicKey seal）
      const payloadKeys = await tx.encryptedPayloadKey.deleteMany({ where: { userId } });

      // 3. 重置 Plaid 同步狀態，讓下次讀取以新 keypair 重新加密寫入
      await tx.plaidSyncLog.deleteMany({ where: { userId } });

      // 4. 清除 passkey + 進行中的 challenge
      const passkeys = await tx.passkeyCredential.deleteMany({ where: { userId } });
      await tx.webAuthnChallenge.deleteMany({ where: { userId } });

      // 5. 清掉使用者身上的 keypair，回到「未設定」狀態
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
