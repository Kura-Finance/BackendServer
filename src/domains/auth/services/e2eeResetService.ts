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
 *   - Plaid / 交易所同步狀態（讓下次讀取重新抓資料）
 *
 * 刻意「保留」連線本身（不需重連）：
 *   - PlaidItem.accessToken、ExchangeAccount.apiKey/apiSecret
 *     （以伺服器金鑰加密，與 E2EE / passkey 無關）
 *
 * 授權：呼叫者必須已透過 Privy 登入（requireAuth）。本流程「不」要求舊 passkey
 * assertion —— 因為用戶正是遺失了 passkey，Privy 登入即為足夠的身分證明。
 */

import { prisma } from '../../shared/lib/prisma';
import { logBusinessEvent, logDebug } from '../../logger';

export interface E2EEResetResult {
  passkeysDeleted: number;
  payloadKeysDeleted: number;
  cachesCleared: Record<string, number>;
}

export class E2EEResetService {
  static async resetForUser(userId: string): Promise<E2EEResetResult> {
    const result = await prisma.$transaction(async (tx) => {
      // 1. 清除 zero-access 加密快取（可重新同步取得）
      const [
        plaidAccounts,
        plaidTransactions,
        plaidInvestmentAccounts,
        plaidInvestments,
        exchangeBalances,
        exchangeAssets,
        debankTokens,
        debankProtocols,
        assetSnapshots,
      ] = await Promise.all([
        tx.plaidAccountCache.deleteMany({ where: { userId } }),
        tx.plaidTransactionCache.deleteMany({ where: { userId } }),
        tx.plaidInvestmentAccountCache.deleteMany({ where: { userId } }),
        tx.plaidInvestmentCache.deleteMany({ where: { userId } }),
        tx.exchangeBalanceCache.deleteMany({ where: { userId } }),
        tx.exchangeAssetCache.deleteMany({ where: { userId } }),
        tx.deBankTokenCache.deleteMany({ where: { userId } }),
        tx.deBankProtocolCache.deleteMany({ where: { userId } }),
        tx.assetSnapshot.deleteMany({ where: { userId } }),
      ]);

      // 2. 清除 payload keys（wrappedSek，皆以舊 publicKey seal）
      const payloadKeys = await tx.encryptedPayloadKey.deleteMany({ where: { userId } });

      // 3. 重置同步狀態，讓下次讀取以新 keypair 重新加密寫入
      await Promise.all([
        tx.plaidSyncLog.deleteMany({ where: { userId } }),
        tx.exchangeSyncLog.deleteMany({ where: { userId } }),
      ]);

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
          exchangeBalances: exchangeBalances.count,
          exchangeAssets: exchangeAssets.count,
          debankTokens: debankTokens.count,
          debankProtocols: debankProtocols.count,
          assetSnapshots: assetSnapshots.count,
        },
      };
    });

    logBusinessEvent('e2ee_reset', userId, {
      passkeysDeleted: result.passkeysDeleted,
      payloadKeysDeleted: result.payloadKeysDeleted,
    });
    logDebug('E2EE layer reset for user', { userId, ...result });

    return result;
  }
}
