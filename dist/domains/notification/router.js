"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../auth/middleware/auth");
const notificationController_1 = require("./controllers/notificationController");
const validateRequest_1 = require("../shared/middleware/validateRequest");
const notificationSchemas_1 = require("./schemas/notificationSchemas");
/**
 * 通知路由
 * 通知系統路由
 * 基礎路徑：/api/notifications
 */
const router = (0, express_1.Router)();
// 所有通知路由都需要驗證
router.use(auth_1.requireAuth);
/**
 * 取得通知偏好設定
 * 路由：GET /api/notifications/preferences
 */
router.get('/preferences', notificationController_1.getPreferences);
/**
 * 更新通知偏好設定
 * 路由：PATCH /api/notifications/preferences
 * 請求內容：{ enableEmailNotifications, enablePushNotifications, ..., priceAlertThreshold }
 */
router.patch('/preferences', (0, validateRequest_1.validateRequest)({ body: notificationSchemas_1.updatePreferencesBodySchema }), notificationController_1.updatePreferences);
/**
 * 批次標記通知為已讀
 * 路由：PATCH /api/notifications/batch/read
 * 請求內容：{ ids: string[] }
 */
router.patch('/batch/read', (0, validateRequest_1.validateRequest)({ body: notificationSchemas_1.markMultipleAsReadBodySchema }), notificationController_1.markMultipleAsRead);
/**
 * 清空所有通知
 * 路由：DELETE /api/notifications/all
 */
router.delete('/all', notificationController_1.clearAllNotifications);
/**
 * 發送通知
 * 路由：POST /api/notifications/send
 * 請求內容：{ types?, category, subject?, title, message, data?, actionUrl?, priority? }
 */
router.post('/send', (0, validateRequest_1.validateRequest)({ body: notificationSchemas_1.sendNotificationBodySchema }), notificationController_1.sendNotification);
/**
 * 取得使用者通知列表
 * 路由：GET /api/notifications?limit=20&offset=0&status=sent&category=price_alert
 * 查詢參數：limit、offset、status、category、startDate、endDate
 */
router.get('/', (0, validateRequest_1.validateRequest)({ query: notificationSchemas_1.getNotificationsQuerySchema }), notificationController_1.getNotifications);
/**
 * 標記單一通知為已讀
 * 路由：PATCH /api/notifications/:id/read
 */
router.patch('/:id/read', (0, validateRequest_1.validateRequest)({ params: notificationSchemas_1.notificationIdParamsSchema }), notificationController_1.markAsRead);
/**
 * 刪除單一通知
 * 路由：DELETE /api/notifications/:id
 */
router.delete('/:id', (0, validateRequest_1.validateRequest)({ params: notificationSchemas_1.notificationIdParamsSchema }), notificationController_1.deleteNotification);
exports.notificationRouter = router;
//# sourceMappingURL=router.js.map