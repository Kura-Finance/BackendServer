"use strict";
/**
 * 通知領域
 * 通知系統主入口
 *
 * 組件：
 * - 模型：型別定義 (types.ts)
 * - 服務：業務邏輯 (notificationService.ts)
 * - 控制器：HTTP 處理 (notificationController.ts)
 * - 路由：路由定義 (router.ts)
 */
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRouter = exports.NotificationService = void 0;
var notificationService_1 = require("./services/notificationService");
Object.defineProperty(exports, "NotificationService", { enumerable: true, get: function () { return notificationService_1.NotificationService; } });
var router_1 = require("./router");
Object.defineProperty(exports, "notificationRouter", { enumerable: true, get: function () { return router_1.notificationRouter; } });
// 重新匯出型別，方便外部使用
__exportStar(require("./models/types"), exports);
//# sourceMappingURL=index.js.map