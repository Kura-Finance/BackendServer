import { Request, Response } from 'express';
import { WalletService } from '../services/walletService';
import { sendSuccess, sendError } from '../../shared/lib/apiResponse';
import { logError } from '../../logger';

export const getWallet = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const wallet = await WalletService.getWallet(userId);
    sendSuccess(res, wallet);
  } catch (error) {
    logError('getWallet failed', error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to get wallet info' });
  }
};

export const updateSca = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const { scaAddress } = req.body as { scaAddress: string };
    const wallet = await WalletService.updateScaAddress(userId, scaAddress);
    sendSuccess(res, wallet);
  } catch (error) {
    logError('updateSca failed', error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to update SCA address' });
  }
};

export const updateEoa = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as Request & { userId: string }).userId;
    const { walletAddress } = req.body as { walletAddress: string };
    const wallet = await WalletService.updateEoaAddress(userId, walletAddress);
    sendSuccess(res, wallet);
  } catch (error) {
    logError('updateEoa failed', error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to update EOA address' });
  }
};
