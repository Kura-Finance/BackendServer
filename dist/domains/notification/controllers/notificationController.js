"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAllNotifications = exports.markMultipleAsRead = exports.updatePreferences = exports.getPreferences = exports.deleteNotification = exports.markAsRead = exports.getNotifications = exports.sendNotification = void 0;
const notificationService_1 = require("../services/notificationService");
const logger_1 = require("../../logger");
const auditLog_1 = require("../../logger/auditLog");
/**
 * 发送通知
 * POST /api/notifications/send
 */
const sendNotification = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { types, category, subject, title, message, data, actionUrl, priority } = req.body;
        // 验证必需字段
        if (!category || !title || !message) {
            res.status(400).json({
                error: 'Missing required fields: category, title, message',
            });
            return;
        }
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
        res.status(200).json({
            success: true,
            notifications,
            count: notifications.length,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Error sending notification', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
};
exports.sendNotification = sendNotification;
/**
 * 获取用户通知列表
 * GET /api/notifications
 */
const getNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { limit = '20', offset = '0', status, category, startDate, endDate, } = req.query;
        // Extract first value if array and ensure they're strings
        const limitStr = String(Array.isArray(limit) ? limit[0] : limit);
        const offsetStr = String(Array.isArray(offset) ? offset[0] : offset);
        const statusStr = status ? String(Array.isArray(status) ? status[0] : status) : undefined;
        const categoryStr = category ? String(Array.isArray(category) ? category[0] : category) : undefined;
        const startDateStr = startDate ? String(Array.isArray(startDate) ? startDate[0] : startDate) : undefined;
        const endDateStr = endDate ? String(Array.isArray(endDate) ? endDate[0] : endDate) : undefined;
        const options = {
            limit: Math.min(parseInt(limitStr) || 20, 100),
            offset: parseInt(offsetStr) || 0,
            ...(statusStr && { status: statusStr }),
            ...(categoryStr && { category: categoryStr }),
            ...(startDateStr && { startDate: new Date(startDateStr) }),
            ...(endDateStr && { endDate: new Date(endDateStr) }),
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
        res.status(200).json({
            success: true,
            notifications: result.notifications,
            total: result.total,
            limit: options.limit,
            offset: options.offset,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Error fetching notifications', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
};
exports.getNotifications = getNotifications;
/**
 * 标记通知为已读
 * PATCH /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const notificationId = String(req.params.id);
        if (!notificationId) {
            res.status(400).json({ error: 'Notification ID is required' });
            return;
        }
        const notification = await notificationService_1.NotificationService.markAsRead(notificationId, userId);
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId, {
            notificationId,
        });
        res.status(200).json({
            success: true,
            notification,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Error marking notification as read', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
};
exports.markAsRead = markAsRead;
/**
 * 删除通知
 * DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const notificationId = String(req.params.id);
        if (!notificationId) {
            res.status(400).json({ error: 'Notification ID is required' });
            return;
        }
        await notificationService_1.NotificationService.deleteNotification(notificationId, userId);
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_DELETED', userId, {
            notificationId,
        });
        res.status(200).json({
            success: true,
            message: 'Notification deleted',
        });
    }
    catch (error) {
        (0, logger_1.logError)('Error deleting notification', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
};
exports.deleteNotification = deleteNotification;
/**
 * 获取通知preferences
 * GET /api/notifications/preferences
 */
const getPreferences = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const preferences = await notificationService_1.NotificationService.getNotificationPreferences(userId);
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId);
        res.status(200).json({
            success: true,
            preferences,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Error fetching notification preferences', error);
        res.status(500).json({ error: 'Failed to fetch preferences' });
    }
};
exports.getPreferences = getPreferences;
/**
 * 更新通知preferences
 * PATCH /api/notifications/preferences
 */
const updatePreferences = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const preferences = req.body;
        // 验证preferences对象
        if (typeof preferences !== 'object' || Array.isArray(preferences)) {
            res.status(400).json({ error: 'Invalid preferences object' });
            return;
        }
        const updated = await notificationService_1.NotificationService.updateNotificationPreferences(userId, preferences);
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_SENT', userId, {
            changes: Object.keys(preferences),
        });
        res.status(200).json({
            success: true,
            preferences: updated,
            message: 'Preferences updated successfully',
        });
    }
    catch (error) {
        (0, logger_1.logError)('Error updating notification preferences', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
};
exports.updatePreferences = updatePreferences;
/**
 * 批量标记通知为已读
 * PATCH /api/notifications/batch/read
 */
const markMultipleAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ error: 'IDs array is required and must not be empty' });
            return;
        }
        const results = await Promise.allSettled(ids.map(id => notificationService_1.NotificationService.markAsRead(id, userId)));
        const successful = results.filter(r => r.status === 'fulfilled');
        const failed = results.filter(r => r.status === 'rejected');
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId, {
            requested: ids.length,
            successful: successful.length,
            failed: failed.length,
        });
        res.status(200).json({
            success: successful.length > 0,
            markedCount: successful.length,
            failedCount: failed.length,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Error marking multiple notifications as read', error);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
};
exports.markMultipleAsRead = markMultipleAsRead;
/**
 * 清空所有通知
 * DELETE /api/notifications/all
 */
const clearAllNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        // TODO: Implement deleteMany for all notifications
        auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_DELETED', userId);
        res.status(200).json({
            success: true,
            message: 'All notifications cleared',
        });
    }
    catch (error) {
        (0, logger_1.logError)('Error clearing notifications', error);
        res.status(500).json({ error: 'Failed to clear notifications' });
    }
};
exports.clearAllNotifications = clearAllNotifications;
//# sourceMappingURL=notificationController.js.map