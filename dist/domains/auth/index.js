"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.authRouter = exports.requireAuth = exports.deleteAccount = exports.resetPassword = exports.requestPasswordReset = exports.updateProfile = exports.me = exports.login = exports.confirmRegister = exports.requestRegisterToken = void 0;
var authController_1 = require("./controllers/authController");
Object.defineProperty(exports, "requestRegisterToken", { enumerable: true, get: function () { return authController_1.requestRegisterToken; } });
Object.defineProperty(exports, "confirmRegister", { enumerable: true, get: function () { return authController_1.confirmRegister; } });
Object.defineProperty(exports, "login", { enumerable: true, get: function () { return authController_1.login; } });
Object.defineProperty(exports, "me", { enumerable: true, get: function () { return authController_1.me; } });
Object.defineProperty(exports, "updateProfile", { enumerable: true, get: function () { return authController_1.updateProfile; } });
Object.defineProperty(exports, "requestPasswordReset", { enumerable: true, get: function () { return authController_1.requestPasswordReset; } });
Object.defineProperty(exports, "resetPassword", { enumerable: true, get: function () { return authController_1.resetPassword; } });
Object.defineProperty(exports, "deleteAccount", { enumerable: true, get: function () { return authController_1.deleteAccount; } });
var auth_1 = require("./middleware/auth");
Object.defineProperty(exports, "requireAuth", { enumerable: true, get: function () { return auth_1.requireAuth; } });
var router_1 = require("./router");
Object.defineProperty(exports, "authRouter", { enumerable: true, get: function () { return __importDefault(router_1).default; } });
var authService_1 = require("./services/authService");
Object.defineProperty(exports, "AuthService", { enumerable: true, get: function () { return authService_1.AuthService; } });
//# sourceMappingURL=index.js.map