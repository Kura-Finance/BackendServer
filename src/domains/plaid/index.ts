/**
 * Plaid domain public exports.
 * Bank / brokerage link, encrypted finance snapshots, and webhooks.
 */
export { default as plaidRouter } from './router';

export { PlaidService } from './services/plaidService';

export {
  createLinkToken,
  exchangePublicToken,
  disconnectPlaidItem,
  getFinanceSnapshotOptimized,
} from './controllers/plaidController';

export type {
  BankingAccountType,
  TransactionType,
  InvestmentAccountType,
  InvestmentType,
  PlaidAccountBucket,
  PlaidAccountPayload,
  PlaidTransactionPayload,
  PlaidInvestmentAccountPayload,
  PlaidInvestmentPayload,
  FinanceSnapshot,
} from './models/types';
