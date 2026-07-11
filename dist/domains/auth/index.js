"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.authRouter = exports.requireAuth = exports.confirmEmailChange = exports.requestEmailChange = exports.verifyEmailAndRegister = exports.sendVerificationCode = exports.deleteAccount = exports.resetPassword = exports.requestPasswordReset = exports.updateDisplayName = exports.updateAvatar = exports.updateProfile = exports.me = void 0;
var authController_1 = require("./controllers/authController");
Object.defineProperty(exports, "me", { enumerable: true, get: function () { return authController_1.me; } });
Object.defineProperty(exports, "updateProfile", { enumerable: true, get: function () { return authController_1.updateProfile; } });
Object.defineProperty(exports, "updateAvatar", { enumerable: true, get: function () { return authController_1.updateAvatar; } });
Object.defineProperty(exports, "updateDisplayName", { enumerable: true, get: function () { return authController_1.updateDisplayName; } });
Object.defineProperty(exports, "requestPasswordReset", { enumerable: true, get: function () { return authController_1.requestPasswordReset; } });
Object.defineProperty(exports, "resetPassword", { enumerable: true, get: function () { return authController_1.resetPassword; } });
Object.defineProperty(exports, "deleteAccount", { enumerable: true, get: function () { return authController_1.deleteAccount; } });
Object.defineProperty(exports, "sendVerificationCode", { enumerable: true, get: function () { return authController_1.sendVerificationCode; } });
Object.defineProperty(exports, "verifyEmailAndRegister", { enumerable: true, get: function () { return authController_1.verifyEmailAndRegister; } });
Object.defineProperty(exports, "requestEmailChange", { enumerable: true, get: function () { return authController_1.requestEmailChange; } });
Object.defineProperty(exports, "confirmEmailChange", { enumerable: true, get: function () { return authController_1.confirmEmailChange; } });
var auth_1 = require("./middleware/auth");
Object.defineProperty(exports, "requireAuth", { enumerable: true, get: function () { return auth_1.requireAuth; } });
var router_1 = require("./router");
Object.defineProperty(exports, "authRouter", { enumerable: true, get: function () { return __importDefault(router_1).default; } });
var authService_1 = require("./services/authService");
Object.defineProperty(exports, "AuthService", { enumerable: true, get: function () { return authService_1.AuthService; } });
//# sourceMappingURL=index.js.map