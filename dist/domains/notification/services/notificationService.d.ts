import type { CreateNotificationPayload, NotificationRecord, NotificationPreferences, NotificationQueryOptions } from '../models/types';
/**
 * 通知服務 - 業務層
 */
export declare class NotificationService {
    /**
     * 發送通知（支援多種類型）
     */
    static sendNotification(payload: CreateNotificationPayload): Promise<NotificationRecord[]>;
    /**
     * 依類型發送通知
     */
    private static sendNotificationByType;
    /**
     * 發送郵件通知
     */
    private static sendEmailNotification;
    /**
     * 發送推播通知
     */
    private static sendPushNotification;
    /**
   * 取得使用者通知列表
     */
    static getNotifications(userId: string, options?: NotificationQueryOptions): Promise<{
        notifications: NotificationRecord[];
        total: number;
    }>;
    /**
   * 標記通知為已讀
     */
    static markAsRead(notificationId: string, userId: string): Promise<NotificationRecord>;
    /**
   * 刪除通知
     */
    static deleteNotification(notificationId: string, userId: string): Promise<void>;
    /**
   * 取得使用者通知偏好設定
     */
    static getNotificationPreferences(userId: string): Promise<NotificationPreferences>;
    /**
     * 更新使用者通知偏好設定
     */
    static updateNotificationPreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
    /**
     * 檢查 category 是否啟用
     */
    private static isCategoryEnabled;
}
//# sourceMappingURL=notificationService.d.ts.map