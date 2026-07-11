"use strict";
// Exchange Domain
// 加密貨幣交易所集成 (CCXT)
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXCHANGES_REQUIRING_PASSPHRASE = exports.EXCHANGE_DISPLAY_MAP = exports.KURA_SUPPORTED_EXCHANGES = exports.exchangeRouter = exports.ExchangeController = exports.ExchangeService = void 0;
var exchangeService_1 = require("./services/exchangeService");
Object.defineProperty(exports, "ExchangeService", { enumerable: true, get: function () { return exchangeService_1.ExchangeService; } });
exports.ExchangeController = __importStar(require("./controllers/exchangeController"));
var router_1 = require("./router");
Object.defineProperty(exports, "exchangeRouter", { enumerable: true, get: function () { return __importDefault(router_1).default; } });
var constants_1 = require("./constants");
Object.defineProperty(exports, "KURA_SUPPORTED_EXCHANGES", { enumerable: true, get: function () { return constants_1.KURA_SUPPORTED_EXCHANGES; } });
Object.defineProperty(exports, "EXCHANGE_DISPLAY_MAP", { enumerable: true, get: function () { return constants_1.EXCHANGE_DISPLAY_MAP; } });
Object.defineProperty(exports, "EXCHANGES_REQUIRING_PASSPHRASE", { enumerable: true, get: function () { return constants_1.EXCHANGES_REQUIRING_PASSPHRASE; } });
//# sourceMappingURL=index.js.map