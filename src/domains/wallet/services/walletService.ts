import { prisma } from '../../shared/lib/prisma';
import { WalletInfo } from '../models/types';

export class WalletService {
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
