/**
 * Wallet HTTP handlers for EOA / SCA address read and update.
 */
import { Request, Response } from 'express';
import { WalletService } from '../services/walletService';
import { sendSuccess, sendError } from '../../shared/lib/apiResponse';
import { logError } from '../../logger';

/** GET /api/wallet — return walletAddress and scaAddress. */
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

/** PUT /api/wallet/sca — update ERC-4337 Smart Contract Account address. */
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

/** PUT /api/wallet/eoa — update Privy embedded EOA address. */
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
