/**
 * Notification Domain Model Types
 */

export type NotificationType = 'email' | 'push' | 'in_app';
export type NotificationCategory = 
  | 'price_alert'      // 价格变化提醒
  | 'account_activity' // 账户活动
  | 'transaction'      // 交易相关
  | 'system_alert'     // 系统提醒
  | 'security';        // 安全相关

export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  subject: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  actionUrl?: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  subject: string;
  title: string;
  message: string;
  data: Record<string, any>;
  actionUrl?: string;
  priority: 'low' | 'normal' | 'high';
  status: NotificationStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNotificationPayload {
  userId: string;
  types?: NotificationType[]; // 支持多种通知类型，默认所有
  category: NotificationCategory;
  subject: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  actionUrl?: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface PriceAlertPayload extends CreateNotificationPayload {
  category: 'price_alert';
  data: {
    symbol: string;
    currentPrice: number;
    changePercent: number;
    threshold: number;
    changeDirection: 'up' | 'down';
  };
}

export interface AccountActivityPayload extends CreateNotificationPayload {
  category: 'account_activity';
  data: {
    activity: 'login' | 'logout' | 'password_changed' | 'email_changed' | 'profile_updated';
    ipAddress?: string;
    device?: string;
    timestamp: string;
  };
}

export interface TransactionPayload extends CreateNotificationPayload {
  category: 'transaction';
  data: {
    transactionType: 'deposit' | 'withdrawal' | 'transfer' | 'trade';
    amount: number;
    currency: string;
    status: 'pending' | 'completed' | 'failed';
    transactionId: string;
  };
}

export interface NotificationPreferences {
  userId: string;
  enableEmailNotifications: boolean;
  enablePushNotifications: boolean;
  enableInAppNotifications: boolean;
  priceAlertThreshold: number; // 百分比
  accountActivityAlerts: boolean;
  transactionAlerts: boolean;
  systemAlerts: boolean;
  securityAlerts: boolean;
  unsubscribeAll: boolean;
}

export interface NotificationQueryOptions {
  limit?: number;
  offset?: number;
  status?: NotificationStatus;
  category?: NotificationCategory;
  startDate?: Date;
  endDate?: Date;
}
