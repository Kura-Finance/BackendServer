import type { CreateNotificationPayload, NotificationRecord, NotificationPreferences, NotificationQueryOptions } from '../models/types';
/**
 * Notification Service - 业务层
 */
export declare class NotificationService {
    /**
     * 发送通知（支持多种类型）
     */
    static sendNotification(payload: CreateNotificationPayload): Promise<NotificationRecord[]>;
    /**
     * 按类型发送通知
     */
    private static sendNotificationByType;
    /**
     * 发送邮件通知
     */
    private static sendEmailNotification;
    /**
     * 发送推送通知
     */
    private static sendPushNotification;
    /**
     * 获取用户通知列表
     */
    static getNotifications(userId: string, options?: NotificationQueryOptions): Promise<{
        notifications: NotificationRecord[];
        total: number;
    }>;
    /**
     * 标记通知为已读
     */
    static markAsRead(notificationId: string, userId: string): Promise<NotificationRecord>;
    /**
     * 删除通知
     */
    static deleteNotification(notificationId: string, userId: string): Promise<void>;
    /**
     * 获取用户通知preferences
     */
    static getNotificationPreferences(userId: string): Promise<NotificationPreferences>;
    /**
     * 更新用户通知preferences
     */
    static updateNotificationPreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
    /**
     * 检查category是否启用
     */
    private static isCategoryEnabled;
}
//# sourceMappingURL=notificationService.d.ts.map