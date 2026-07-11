"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAllNotifications = exports.markMultipleAsRead = exports.updatePreferences = exports.getPreferences = exports.deleteNotification = exports.markAsRead = exports.getNotifications = exports.sendNotification = void 0;
const notificationService_1 = require("../services/notificationService");
const logger_1 = require("../../logger");
const auditLog_1 = require("../../logger/auditLog");
const apiResponse_1 = require("../../shared/lib/apiResponse");
/**
 * 發送通知
 * 路由：POST /api/notifications/send
 */
const sendNotification = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const { types, category, subject, title, message, data, actionUrl, priority } = req.body;
        const payload = {
            userId,
            types,
            category,
            subject: subject || title,
            title,
            message,
            data,
            actionUrl,
            priority: (priority || 'normal'),
        };
        const notifications = await notificationService_1.NotificationService.sendNotification(payload);
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_SENT', userId, {
            category,
            notificationCount: notifications.length,
        });
        (0, apiResponse_1.sendSuccess)(res, {
            notifications,
            count: notifications.length,
        }, 200);
    }
    catch (error) {
        (0, logger_1.logError)('Error sending notification', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to send notification' });
    }
};
exports.sendNotification = sendNotification;
/**
 * 取得使用者通知列表
 * 路由：GET /api/notifications
 */
const getNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const { limit = 20, offset = 0, status, category, startDate, endDate } = req.query;
        const options = {
            limit,
            offset,
            ...(status && { status: status }),
            ...(category && { category: category }),
            ...(startDate && { startDate: new Date(startDate) }),
            ...(endDate && { endDate: new Date(endDate) }),
        };
        (0, logger_1.logDebug)('Fetching notifications', {
            userId,
            options,
        });
        const result = await notificationService_1.NotificationService.getNotifications(userId, options);
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId, {
            limit: options.limit,
            offset: options.offset,
            total: result.total,
        });
        (0, apiResponse_1.sendSuccess)(res, {
            notifications: result.notifications,
            total: result.total,
            limit: options.limit,
            offset: options.offset,
        }, 200);
    }
    catch (error) {
        (0, logger_1.logError)('Error fetching notifications', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch notifications' });
    }
};
exports.getNotifications = getNotifications;
/**
 * 標記通知為已讀
 * 路由：PATCH /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const notificationId = req.params.id;
        const notification = await notificationService_1.NotificationService.markAsRead(notificationId, userId);
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId, {
            notificationId,
        });
        (0, apiResponse_1.sendSuccess)(res, {
            notification,
        }, 200);
    }
    catch (error) {
        (0, logger_1.logError)('Error marking notification as read', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to mark notification as read' });
    }
};
exports.markAsRead = markAsRead;
/**
 * 刪除通知
 * 路由：DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const notificationId = req.params.id;
        await notificationService_1.NotificationService.deleteNotification(notificationId, userId);
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_DELETED', userId, {
            notificationId,
        });
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'Notification deleted',
        }, 200);
    }
    catch (error) {
        (0, logger_1.logError)('Error deleting notification', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to delete notification' });
    }
};
exports.deleteNotification = deleteNotification;
/**
 * 取得通知偏好設定
 * 路由：GET /api/notifications/preferences
 */
const getPreferences = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const preferences = await notificationService_1.NotificationService.getNotificationPreferences(userId);
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId);
        (0, apiResponse_1.sendSuccess)(res, {
            preferences,
        }, 200);
    }
    catch (error) {
        (0, logger_1.logError)('Error fetching notification preferences', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch preferences' });
    }
};
exports.getPreferences = getPreferences;
/**
 * 更新通知偏好設定
 * 路由：PATCH /api/notifications/preferences
 */
const updatePreferences = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const preferences = req.body;
        const updated = await notificationService_1.NotificationService.updateNotificationPreferences(userId, preferences);
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_SENT', userId, {
            changes: Object.keys(preferences),
        });
        (0, apiResponse_1.sendSuccess)(res, {
            preferences: updated,
            message: 'Preferences updated successfully',
        }, 200);
    }
    catch (error) {
        (0, logger_1.logError)('Error updating notification preferences', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to update preferences' });
    }
};
exports.updatePreferences = updatePreferences;
/**
 * 批次標記通知為已讀
 * 路由：PATCH /api/notifications/batch/read
 */
const markMultipleAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        const { ids } = req.body;
        const results = await Promise.allSettled(ids.map((id) => notificationService_1.NotificationService.markAsRead(id, userId)));
        const successful = results.filter(r => r.status === 'fulfilled');
        const failed = results.filter(r => r.status === 'rejected');
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId, {
            requested: ids.length,
            successful: successful.length,
            failed: failed.length,
        });
        (0, apiResponse_1.sendSuccess)(res, {
            hasSuccess: successful.length > 0,
            markedCount: successful.length,
            failedCount: failed.length,
        }, 200);
    }
    catch (error) {
        (0, logger_1.logError)('Error marking multiple notifications as read', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to mark notifications as read' });
    }
};
exports.markMultipleAsRead = markMultipleAsRead;
/**
 * 清空所有通知
 * 路由：DELETE /api/notifications/all
 */
const clearAllNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            (0, apiResponse_1.sendError)(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
            return;
        }
        // TODO: 實作批次刪除（deleteMany）以清空所有通知
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_DELETED', userId);
        (0, apiResponse_1.sendSuccess)(res, {
            message: 'All notifications cleared',
        }, 200);
    }
    catch (error) {
        (0, logger_1.logError)('Error clearing notifications', error);
        (0, apiResponse_1.sendError)(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to clear notifications' });
    }
};
exports.clearAllNotifications = clearAllNotifications;
//# sourceMappingURL=notificationController.js.map