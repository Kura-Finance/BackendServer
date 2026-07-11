// 路由
export { default as bridgeRouter } from './router';

// 服務
export { BridgeService, BridgeError } from './services/bridgeService';

// 控制器
export {
  createKycLink,
  getCustomerStatus,
  createOnRamp,
  listVirtualAccounts,
  listDeposits,
  createOffRamp,
  getTransfer,
  listTransfers,
  createExternalAccount,
  listExternalAccounts,
  handleBridgeWebhook,
} from './controllers/bridgeController';

// 型別
export type {
  BridgeCustomerType,
  BridgeEndorsementType,
  BridgeTransferDirection,
  CreateKycLinkParams,
  CreateVirtualAccountParams,
  KycLinkResult,
  CustomerStatusResult,
  TransferResult,
  VirtualAccountResult,
  DepositResult,
  DepositEvent,
  ExternalAccountResult,
} from './models/types';
