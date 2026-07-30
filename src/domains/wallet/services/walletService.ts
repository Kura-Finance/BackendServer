/**
 * Wallet service — persist and read user EOA / SCA addresses.
 */
import { prisma } from '../../shared/lib/prisma';
import { WalletInfo } from '../models/types';

export class WalletService {
  /** Load walletAddress (EOA) and scaAddress for a user. */
  static async getWallet(userId: string): Promise<WalletInfo> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { walletAddress: true, scaAddress: true },
    });
    return {
      walletAddress: user.walletAddress ?? null,
      scaAddress: user.scaAddress ?? null,
    };
  }

  /** Set ERC-4337 Smart Contract Account address. */
  static async updateScaAddress(userId: string, scaAddress: string): Promise<WalletInfo> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { scaAddress },
      select: { walletAddress: true, scaAddress: true },
    });
    return {
      walletAddress: user.walletAddress ?? null,
      scaAddress: user.scaAddress ?? null,
    };
  }

  /** Set Privy embedded EOA address. */
  static async updateEoaAddress(userId: string, walletAddress: string): Promise<WalletInfo> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { walletAddress },
      select: { walletAddress: true, scaAddress: true },
    });
    return {
      walletAddress: user.walletAddress ?? null,
      scaAddress: user.scaAddress ?? null,
    };
  }
}
