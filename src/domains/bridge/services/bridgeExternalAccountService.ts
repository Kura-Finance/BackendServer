/**
 * Bridge external (bank) accounts for off-ramp payouts.
 */

import { prisma } from '../../shared/lib/prisma';
import { appLogger } from '../../logger';
import { DemoService } from '../../demo/demoService';
import type {
  BridgeExternalAccountResponse,
  ExternalAccountResult,
} from '../models/types';
import { BridgeError, bridgeFetch } from '../lib/bridgeHttp';
import {
  requireTransactableCustomer,
  withStaleCustomerGuard,
} from '../lib/bridgeCustomerAccess';

export class BridgeExternalAccountService {
  static async createExternalAccount(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<ExternalAccountResult> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeExternalAccountFromBody(body);
    }

    const bridgeCustomerId = await requireTransactableCustomer(userId);

    const payload = this.buildExternalAccountPayload(body);

    const account = await withStaleCustomerGuard(userId, 'createExternalAccount', () =>
      bridgeFetch<BridgeExternalAccountResponse>(
        `/customers/${bridgeCustomerId}/external_accounts`,
        { method: 'POST', body: payload },
      ),
    );

    const record = await prisma.bridgeExternalAccount.upsert({
      where: { bridgeExternalAccountId: account.id },
      create: {
        userId,
        bridgeExternalAccountId: account.id,
        bridgeCustomerId,
        bankName: account.bank_name ?? null,
        accountOwnerName: account.account_owner_name ?? null,
        last4: account.last_4 ?? null,
        currency: account.currency ?? (body.currency as string) ?? 'usd',
        active: account.active ?? true,
      },
      update: {
        ...(account.bank_name ? { bankName: account.bank_name } : {}),
        ...(account.account_owner_name ? { accountOwnerName: account.account_owner_name } : {}),
        ...(account.last_4 ? { last4: account.last_4 } : {}),
        ...(account.active !== undefined ? { active: account.active } : {}),
      },
    });

    appLogger.info('[BridgeService] External account created', {
      userId,
      externalAccountId: account.id,
    });

    return {
      bridgeExternalAccountId: record.bridgeExternalAccountId,
      bankName: record.bankName,
      accountOwnerName: record.accountOwnerName,
      last4: record.last4,
      currency: record.currency,
      active: record.active,
    };
  }

  static async listExternalAccounts(userId: string): Promise<ExternalAccountResult[]> {
    if (await DemoService.isDemoUser(userId)) {
      return DemoService.bridgeExternalAccounts();
    }

    const records = await prisma.bridgeExternalAccount.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => ({
      bridgeExternalAccountId: r.bridgeExternalAccountId,
      bankName: r.bankName,
      accountOwnerName: r.accountOwnerName,
      last4: r.last4,
      currency: r.currency,
      active: r.active,
    }));
  }

  static async deleteExternalAccount(
    userId: string,
    externalAccountId: string,
  ): Promise<ExternalAccountResult> {
    if (await DemoService.isDemoUser(userId)) {
      if (!DemoService.isBridgeExternalAccountId(externalAccountId)) {
        throw new BridgeError(
          404,
          'External account not found for this user.',
          'deleteExternalAccount',
        );
      }
      const config = DemoService.bridgeExternalAccounts().find(
        (a) => a.bridgeExternalAccountId === externalAccountId,
      );
      return DemoService.bridgeDeletedExternalAccount(config?.currency ?? 'usd');
    }

    const record = await prisma.bridgeExternalAccount.findFirst({
      where: { userId, bridgeExternalAccountId: externalAccountId },
    });
    if (!record) {
      throw new BridgeError(
        404,
        'External account not found for this user.',
        'deleteExternalAccount',
      );
    }

    const bridgeCustomerId = record.bridgeCustomerId ?? (await requireTransactableCustomer(userId));

    const account = await withStaleCustomerGuard(userId, 'deleteExternalAccount', () =>
      bridgeFetch<BridgeExternalAccountResponse>(
        `/customers/${bridgeCustomerId}/external_accounts/${externalAccountId}`,
        { method: 'DELETE' },
      ),
    );

    const updated = await prisma.bridgeExternalAccount.update({
      where: { id: record.id },
      data: { active: account.active ?? false },
    });

    appLogger.info('[BridgeService] External account deleted', {
      userId,
      externalAccountId,
    });

    return {
      bridgeExternalAccountId: updated.bridgeExternalAccountId,
      bankName: updated.bankName,
      accountOwnerName: updated.accountOwnerName,
      last4: updated.last4,
      currency: updated.currency,
      active: updated.active,
    };
  }

  private static buildExternalAccountPayload(body: Record<string, unknown>): Record<string, unknown> {
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const value = body[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      const nested = body.account as Record<string, unknown> | undefined;
      if (nested) {
        for (const key of keys) {
          const value = nested[key];
          if (typeof value === 'string' && value.trim()) return value.trim();
        }
      }
      return undefined;
    };

    const accountType =
      pick('accountType', 'account_type')
      ?? (pick('brCode', 'br_code') ? 'pix' : undefined)
      ?? (pick('pixKey', 'pix_key') ? 'pix' : undefined)
      ?? (pick('clabe') ? 'clabe' : undefined)
      ?? (pick('sortCode', 'sort_code') ? 'gb' : undefined)
      ?? (pick('iban') ? 'iban' : undefined)
      ?? 'us';

    const payload: Record<string, unknown> = {
      currency: pick('currency') ?? 'usd',
      ...(pick('bankName', 'bank_name') ? { bank_name: pick('bankName', 'bank_name') } : {}),
      ...(pick('accountOwnerName', 'account_owner_name')
        ? { account_owner_name: pick('accountOwnerName', 'account_owner_name') }
        : {}),
      ...(pick('firstName', 'first_name') ? { first_name: pick('firstName', 'first_name') } : {}),
      ...(pick('lastName', 'last_name') ? { last_name: pick('lastName', 'last_name') } : {}),
      ...(pick('businessName', 'business_name')
        ? { account_owner_type: 'business', business_name: pick('businessName', 'business_name') }
        : { account_owner_type: 'individual' }),
      ...(body.address ? { address: body.address } : {}),
    };

    if (accountType === 'iban') {
      payload.account_type = 'iban';
      payload.iban = {
        account_number: pick('iban'),
        ...(pick('bic') ? { bic: pick('bic') } : {}),
        ...(body.address && (body.address as Record<string, unknown>).country
          ? { country: (body.address as Record<string, unknown>).country }
          : {}),
      };
      return payload;
    }

    if (accountType === 'clabe') {
      payload.account_type = 'clabe';
      payload.clabe = { account_number: pick('clabe') };
      return payload;
    }

    if (accountType === 'pix') {
      payload.account_type = 'pix';
      const brCode = pick('brCode', 'br_code');
      const documentNumber = pick('documentNumber', 'document_number');
      if (brCode) {
        payload.br_code = {
          br_code: brCode,
          ...(documentNumber ? { document_number: documentNumber } : {}),
        };
      } else {
        payload.pix_key = {
          pix_key: pick('pixKey', 'pix_key'),
          ...(documentNumber ? { document_number: documentNumber } : {}),
        };
      }
      return payload;
    }

    if (accountType === 'gb') {
      payload.account_type = 'gb';
      payload.account = {
        account_number: pick('accountNumber', 'account_number'),
        sort_code: pick('sortCode', 'sort_code'),
      };
      return payload;
    }

    const checkingOrSavings = pick('checkingOrSavings', 'checking_or_savings') ?? 'checking';
    payload.account_type = 'us';
    payload.account = {
      account_number: pick('accountNumber', 'account_number'),
      routing_number: pick('routingNumber', 'routing_number'),
      checking_or_savings: checkingOrSavings,
    };
    return payload;
  }
}
