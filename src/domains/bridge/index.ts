/**
 * Bridge domain public exports (router, facade, controllers, types).
 */

// Router
export { default as bridgeRouter } from './router';

// Service facade
export { BridgeService, BridgeError, CURRENCY_ENDORSEMENT, resolveEndorsementForCurrency } from './services/bridgeService';

// Controllers
export {
  createKycLink,
  createEndorsementLink,
  getOrCreateCryptoDepositAddress,
  listCryptoDepositAddresses,
  getCustomerStatus,
  createOnRamp,
  listVirtualAccounts,
  listDeposits,
  getOrCreatePayoutAddress,
  listPayoutAddresses,
  listPayoutDrains,
  listPayoutOptions,
  getTransfer,
  listTransfers,
  createExternalAccount,
  deleteExternalAccount,
  listExternalAccounts,
  handleBridgeWebhook,
} from './controllers/bridgeController';

// Types
export type {
  BridgeCustomerType,
  BridgeEndorsementType,
  BridgeTransferDirection,
  CreateKycLinkParams,
  CreateVirtualAccountParams,
  CreateLiquidationAddressParams,
  LIQUIDATION_ADDRESS_TRON_USDT_TO_BASE_USDC,
  CRYPTO_TRANSFER_TRON_USDT_TO_BASE_USDC,
  CreatePayoutAddressParams,
  PAYOUT_LIQUIDATION_SOURCE,
  PayoutLiquidationAddressResult,
  PayoutDrainResult,
  PayoutDeveloperFee,
  MinDeposit,
  grossMinDeposit,
  TRON_USDT_MIN_DEPOSIT_NET,
  resolveOnRampMinDeposit,
  resolvePayoutMinDeposit,
  resolveTronUsdtMinDeposit,
  EndorsementLinkResult,
  KycLinkResult,
  LiquidationAddressResult,
  DepositDeveloperFee,
  CustomerStatusResult,
  BridgeRejectionReasonPublic,
  TransferResult,
  VirtualAccountResult,
  DepositResult,
  DepositEvent,
  DepositPayerInfo,
  ExternalAccountResult,
  PayoutOption,
  BridgeFundsRequestResponse,
  BridgeFundsRequestStatus,
  FundsRequestListItem,
  FundsRequestsSyncExecuted,
  FiatDepositReturnResult,
} from './models/types';
export {
  CUSTOMER_NAMED_PAYOUT_CONFIGURATION,
  EMPTY_DEPOSIT_PAYER,
  PAYOUT_OPTION_BASES,
  parseDepositPayerSource,
} from './models/types';
