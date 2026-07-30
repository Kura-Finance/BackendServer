/**
 * Wallet domain model types.
 */
export interface WalletInfo {
  walletAddress: string | null; // Privy embedded EOA
  scaAddress: string | null;    // ERC-4337 Smart Contract Account
}
