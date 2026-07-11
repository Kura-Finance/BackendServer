"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRouter = void 0;
const express_1 = require("express");
const notificationController_1 = require("./controllers/notificationController");
/**
 * Notification Router
 * 通知系统路由
 * Base: /api/notifications
 */
const router = (0, express_1.Router)();
/**
 * 获取通知preferences
 * GET /api/notifications/preferences
 */
router.get('/preferences', notificationController_1.getPreferences);
/**
 * 更新通知preferences
 * PATCH /api/notifications/preferences
 * Body: { enableEmailNotifications, enablePushNotifications, ..., priceAlertThreshold }
 */
router.patch('/preferences', notificationController_1.updatePreferences);
/**
 * 批量标记通知为已读
 * PATCH /api/notifications/batch/read
 * Body: { ids: string[] }
 */
router.patch('/batch/read', notificationController_1.markMultipleAsRead);
/**
 * 清空所有通知
 * DELETE /api/notifications/all
 */
router.delete('/all', notificationController_1.clearAllNotifications);
/**
 * 发送通知
 * POST /api/notifications/send
 * Body: { types?, category, subject?, title, message, data?, actionUrl?, priority? }
 */
router.post('/send', notificationController_1.sendNotification);
/**
 * 获取用户通知列表
 * GET /api/notifications?limit=20&offset=0&status=sent&category=price_alert
 * Query: limit, offset, status, category, startDate, endDate
 */
router.get('/', notificationController_1.getNotifications);
/**
 * 标记单个通知为已读
 * PATCH /api/notifications/:id/read
 */
router.patch('/:id/read', notificationController_1.markAsRead);
/**
 * 删除单个通知
 * DELETE /api/notifications/:id
 */
router.delete('/:id', notificationController_1.deleteNotification);
exports.notificationRouter = router;
//# sourceMappingURL=router.js.map