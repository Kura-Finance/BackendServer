// 路由
export { default as bridgeRouter } from './router';

// 服務
export { BridgeService, BridgeError } from './services/bridgeService';

// 控制器
export {
  createKycLink,
  getCustomerStatus,
  createOnRamp,
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
  BridgeTransferDirection,
  KycLinkResult,
  CustomerStatusResult,
  TransferResult,
  ExternalAccountResult,
} from './models/types';
