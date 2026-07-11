"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.plaidClient = void 0;
const plaid_1 = require("plaid");
const dotenv_1 = __importDefault(require("dotenv"));
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
const envResult = dotenv_1.default.config({ path: envFile });
if (envResult.error) {
    dotenv_1.default.config();
}
const plaidEnv = process.env.PLAID_ENV || 'sandbox';
const basePath = plaid_1.PlaidEnvironments[plaidEnv];
if (!basePath) {
    throw new Error(`Invalid PLAID_ENV value: ${plaidEnv}`);
}
const configuration = new plaid_1.Configuration({
    basePath,
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || '',
            'PLAID-SECRET': process.env.PLAID_SECRET || '',
        },
    },
});
exports.plaidClient = new plaid_1.PlaidApi(configuration);
//# sourceMappingURL=plaid.js.map