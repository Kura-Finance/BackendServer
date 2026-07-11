"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const prisma_1 = require("../../shared/lib/prisma");
const logger_1 = require("../../logger");
const auditLog_1 = require("../../logger/auditLog");
const DEFAULT_NOTIFICATION_TYPES = ['email', 'in_app'];
/**
 * 通知服務 - 業務層
 */
class NotificationService {
    /**
     * 發送通知（支援多種類型）
     */
    static async sendNotification(payload) {
        const startTime = Date.now();
        try {
            (0, logger_1.logDebug)('Sending notification', {
                userId: payload.userId,
                category: payload.category,
                types: payload.types || DEFAULT_NOTIFICATION_TYPES,
            });
            // 取得使用者通知偏好設定
            const preferences = await this.getNotificationPreferences(payload.userId);
            // 檢查使用者是否取消訂閱
            if (preferences.unsubscribeAll) {
                (0, logger_1.logDebug)('User unsubscribed from notifications', { userId: payload.userId });
                return [];
            }
            // 依據 category 檢查是否啟用
            if (!this.isCategoryEnabled(payload.category, preferences)) {
                (0, logger_1.logDebug)('Notification category disabled for user', {
                    userId: payload.userId,
                    category: payload.category,
                });
                return [];
            }
            // 決定要發送的通知類型
            const notificationTypes = payload.types || DEFAULT_NOTIFICATION_TYPES;
            const results = [];
            // 平行發送各類型通知
            const notificationPromises = notificationTypes.map(type => this.sendNotificationByType(type, payload));
            const sendResults = await Promise.allSettled(notificationPromises);
            sendResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    results.push(result.value);
                }
                else if (result.status === 'rejected') {
                    (0, logger_1.logError)('Failed to send notification', result.reason, {
                        userId: payload.userId,
                        type: notificationTypes[index],
                    });
                }
            });
            // 記錄審計日誌
            auditLog_1.AuditLogger.logNotificationEvent('NOTIFICATION_SENT', payload.userId, {
                category: payload.category,
                types: notificationTypes,
                count: results.length,
            });
            (0, logger_1.logBusinessEvent)('notification_sent', payload.userId, {
                category: payload.category,
                types: notificationTypes,
                successCount: results.length,
            });
            (0, logger_1.logDatabaseOperation)('CREATE', 'notifications', Date.now() - startTime, results.length > 0);
            return results;
        }
        catch (error) {
            (0, logger_1.logError)('Error sending notification', error, {
                userId: payload.userId,
                category: payload.category,
            });
            throw error;
        }
    }
    /**
     * 依類型發送通知
     */
    static async sendNotificationByType(type, payload) {
        const startTime = Date.now();
        try {
            // 建立通知紀錄
            const notification = await prisma_1.prisma.notification.create({
                data: {
                    userId: payload.userId,
                    type,
                    category: payload.category,
                    subject: payload.subject || null,
                    title: payload.title,
                    message: payload.message,
                    data: payload.data,
                    actionUrl: payload.actionUrl || null,
                    priority: payload.priority || 'normal',
                    status: 'pending',
                },
            });
            (0, logger_1.logDatabaseOperation)('CREATE', 'notifications', Date.now() - startTime, true);
            // 依類型發送
            if (type === 'email') {
                await this.sendEmailNotification(notification, payload);
            }
            else if (type === 'push') {
                await this.sendPushNotification(notification, payload);
            }
            else if (type === 'in_app') {
                // in_app 通知直接儲存，不需要額外發送
                await prisma_1.prisma.notification.update({
                    where: { id: notification.id },
                    data: { status: 'delivered', deliveredAt: new Date() },
                });
            }
            // 回傳通知紀錄
            return await prisma_1.prisma.notification.findUnique({
                where: { id: notification.id },
            });
        }
        catch (error) {
            (0, logger_1.logError)(`Failed to send ${type} notification`, error, {
                userId: payload.userId,
            });
            throw error;
        }
    }
    /**
     * 發送郵件通知
     */
    static async sendEmailNotification(notification, payload) {
        try {
            // 在此整合郵件服務（Resend API）
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: payload.userId },
                select: { email: true },
            });
            if (!user) {
                throw new Error('User not found');
            }
            // 呼叫郵件服務發送
            //   const result = await emailService.send({
            //     to: user.email,
            //     subject: payload.subject,
            //     html: payload.message,
            //   });
            // 更新通知狀態
            await prisma_1.prisma.notification.update({
                where: { id: notification.id },
                data: {
                    status: 'sent',
                    sentAt: new Date(),
                },
            });
            (0, logger_1.logDebug)('Email notification sent', { notificationId: notification.id });
        }
        catch (error) {
            await prisma_1.prisma.notification.update({
                where: { id: notification.id },
                data: {
                    status: 'failed',
                    failureReason: error instanceof Error ? error.message : 'Unknown error',
                },
            });
            throw error;
        }
    }
    /**
     * 發送推播通知
     */
    static async sendPushNotification(notification, payload) {
        try {
            // 在此整合推播服務（如 Firebase Messaging）
            // const result = await pushService.send({
            //   userId: payload.userId,
            //   title: payload.title,
            //   body: payload.message,
            //   data: payload.data,
            // });
            await prisma_1.prisma.notification.update({
                where: { id: notification.id },
                data: {
                    status: 'sent',
                    sentAt: new Date(),
                },
            });
            (0, logger_1.logDebug)('Push notification sent', { notificationId: notification.id });
        }
        catch (error) {
            await prisma_1.prisma.notification.update({
                where: { id: notification.id },
                data: {
                    status: 'failed',
                    failureReason: error instanceof Error ? error.message : 'Unknown error',
                },
            });
            throw error;
        }
    }
    /**
   * 取得使用者通知列表
     */
    static async getNotifications(userId, options = {}) {
        const limit = options.limit || 20;
        const offset = options.offset || 0;
        try {
            const [notifications, total] = await Promise.all([
                prisma_1.prisma.notification.findMany({
                    where: {
                        userId,
                        ...(options.status && { status: options.status }),
                        ...(options.category && { category: options.category }),
                        ...(options.startDate && {
                            createdAt: { gte: options.startDate },
                        }),
                        ...(options.endDate && {
                            createdAt: { lte: options.endDate },
                        }),
                    },
                    orderBy: { createdAt: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                prisma_1.prisma.notification.count({
                    where: {
                        userId,
                        ...(options.status && { status: options.status }),
                        ...(options.category && { category: options.category }),
                    },
                }),
            ]);
            return {
                notifications: notifications,
                total,
            };
        }
        catch (error) {
            (0, logger_1.logError)('Failed to fetch notifications', error, { userId });
            throw error;
        }
    }
    /**
   * 標記通知為已讀
     */
    static async markAsRead(notificationId, userId) {
        try {
            const notification = await prisma_1.prisma.notification.findUnique({
                where: { id: notificationId },
            });
            if (!notification || notification.userId !== userId) {
                throw new Error('Notification not found');
            }
            const updated = await prisma_1.prisma.notification.update({
                where: { id: notificationId },
                data: {
                    status: 'read',
                    readAt: new Date(),
                },
            });
            return updated;
        }
        catch (error) {
            (0, logger_1.logError)('Failed to mark notification as read', error, {
                notificationId,
                userId,
            });
            throw error;
        }
    }
    /**
   * 刪除通知
     */
    static async deleteNotification(notificationId, userId) {
        try {
            const notification = await prisma_1.prisma.notification.findUnique({
                where: { id: notificationId },
            });
            if (!notification || notification.userId !== userId) {
                throw new Error('Notification not found');
            }
            await prisma_1.prisma.notification.delete({
                where: { id: notificationId },
            });
            (0, logger_1.logDebug)('Notification deleted', {
                notificationId,
                userId,
            });
        }
        catch (error) {
            (0, logger_1.logError)('Failed to delete notification', error, {
                notificationId,
                userId,
            });
            throw error;
        }
    }
    /**
   * 取得使用者通知偏好設定
     */
    static async getNotificationPreferences(userId) {
        try {
            let prefs = await prisma_1.prisma.notificationPreferences.findUnique({
                where: { userId },
            });
            // 若不存在，建立預設偏好設定
            if (!prefs) {
                prefs = await prisma_1.prisma.notificationPreferences.create({
                    data: {
                        userId,
                        enableEmailNotifications: true,
                        enablePushNotifications: true,
                        enableInAppNotifications: true,
                        priceAlertThreshold: 5,
                        accountActivityAlerts: true,
                        transactionAlerts: true,
                        systemAlerts: true,
                        securityAlerts: true,
                        unsubscribeAll: false,
                    },
                });
            }
            return {
                userId: prefs.userId,
                enableEmailNotifications: prefs.enableEmailNotifications,
                enablePushNotifications: prefs.enablePushNotifications,
                enableInAppNotifications: prefs.enableInAppNotifications,
                priceAlertThreshold: prefs.priceAlertThreshold,
                accountActivityAlerts: prefs.accountActivityAlerts,
                transactionAlerts: prefs.transactionAlerts,
                systemAlerts: prefs.systemAlerts,
                securityAlerts: prefs.securityAlerts,
                unsubscribeAll: prefs.unsubscribeAll,
            };
        }
        catch (error) {
            (0, logger_1.logError)('Failed to fetch notification preferences', error, { userId });
            return {
                userId,
                enableEmailNotifications: true,
                enablePushNotifications: true,
                enableInAppNotifications: true,
                priceAlertThreshold: 5,
                accountActivityAlerts: true,
                transactionAlerts: true,
                systemAlerts: true,
                securityAlerts: true,
                unsubscribeAll: false,
            };
        }
    }
    /**
     * 更新使用者通知偏好設定
     */
    static async updateNotificationPreferences(userId, preferences) {
        try {
            // 檢查 preferences 是否存在，若不存在則建立
            let existing = await prisma_1.prisma.notificationPreferences.findUnique({
                where: { userId },
            });
            if (!existing) {
                existing = await prisma_1.prisma.notificationPreferences.create({
                    data: {
                        userId,
                        enableEmailNotifications: true,
                        enablePushNotifications: true,
                        enableInAppNotifications: true,
                        priceAlertThreshold: 5,
                        accountActivityAlerts: true,
                        transactionAlerts: true,
                        systemAlerts: true,
                        securityAlerts: true,
                        unsubscribeAll: false,
                    },
                });
            }
            const updated = await prisma_1.prisma.notificationPreferences.update({
                where: { userId },
                data: preferences,
            });
            (0, logger_1.logBusinessEvent)('notification_preferences_updated', userId, {
                changes: Object.keys(preferences),
            });
            return {
                userId: updated.userId,
                enableEmailNotifications: updated.enableEmailNotifications,
                enablePushNotifications: updated.enablePushNotifications,
                enableInAppNotifications: updated.enableInAppNotifications,
                priceAlertThreshold: updated.priceAlertThreshold,
                accountActivityAlerts: updated.accountActivityAlerts,
                transactionAlerts: updated.transactionAlerts,
                systemAlerts: updated.systemAlerts,
                securityAlerts: updated.securityAlerts,
                unsubscribeAll: updated.unsubscribeAll,
            };
        }
        catch (error) {
            (0, logger_1.logError)('Failed to update notification preferences', error, { userId });
            throw error;
        }
    }
    /**
     * 檢查 category 是否啟用
     */
    static isCategoryEnabled(category, preferences) {
        switch (category) {
            case 'price_alert':
                return preferences.enableEmailNotifications || preferences.enablePushNotifications;
            case 'account_activity':
                return preferences.accountActivityAlerts;
            case 'transaction':
                return preferences.transactionAlerts;
            case 'system_alert':
                return preferences.systemAlerts;
            case 'security':
                return preferences.securityAlerts;
            default:
                return true;
        }
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notificationService.js.map