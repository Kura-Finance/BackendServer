import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { PlaidService } from '../services/plaidService';
import { logError } from '../../logger';
import { StoredAccountOrderPayload } from '../models/types';

export const updatePlaidAccountOrder = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { accountIds, investmentAccountIds } = req.body as StoredAccountOrderPayload;

    if (accountIds === undefined && investmentAccountIds === undefined) {
      res.status(400).json({ error: 'accountIds or investmentAccountIds is required' });
      return;
    }

    const payload: StoredAccountOrderPayload = {};
    if (accountIds !== undefined) {
      payload.accountIds = accountIds;
    }
    if (investmentAccountIds !== undefined) {
      payload.investmentAccountIds = investmentAccountIds;
    }

    await PlaidService.updateAccountOrder(req.userId, payload);
    res.json({ status: 'success', message: 'Account order updated successfully.' });
  } catch (error: any) {
    logError('Update account order failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: '無法更新卡片排序' });
  }
};

export const createLinkToken = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const linkToken = await PlaidService.createLinkToken(req.userId);
    res.json({ link_token: linkToken });
  } catch (error: any) {
    logError('Create Plaid link token failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: '無法產生 Plaid Link Token' });
  }
};

export const exchangePublicToken = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { public_token, institution_name } = req.body;
    await PlaidService.exchangePublicToken(req.userId, public_token, institution_name);
    res.json({ status: 'success', message: '銀行帳戶已成功連結' });
  } catch (error: any) {
    logError('Exchange Plaid public token failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: 'Token 交換失敗' });
  }
};

export const disconnectPlaidAccount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { accountId } = req.body as { accountId?: string };
    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' });
      return;
    }

    await PlaidService.disconnectAccount(req.userId, accountId);
    res.json({ status: 'success', message: 'Account disconnected successfully.' });
  } catch (error: any) {
    logError('Disconnect Plaid account failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: '無法解除連結銀行帳戶' });
  }
};

export const getFinanceSnapshot = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const snapshot = await PlaidService.getFinanceSnapshot(req.userId);
    res.json(snapshot);
  } catch (error: any) {
    logError('Get finance snapshot failed', error, {
      userId: req.userId,
      errorData: error.response?.data,
    });
    res.status(500).json({ error: '無法取得 Plaid 金融資料' });
  }
};
