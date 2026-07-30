/** Notification service — multi-channel delivery and user preferences. */

import { prisma } from '../../shared/lib/prisma';
import { appLogger, logDebug, logError, logBusinessEvent, logDatabaseOperation } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';
import type {
  NotificationPayload,
  CreateNotificationPayload,
  NotificationRecord,
  NotificationPreferences,
  NotificationQueryOptions,
} from '../models/types';

const DEFAULT_NOTIFICATION_TYPES = ['email', 'in_app'] as const;

/**
 * Notification service — business logic for delivery and preferences.
 */
export class NotificationService {
  /**
   * Send a notification across one or more channels.
   */
  static async sendNotification(payload: CreateNotificationPayload): Promise<NotificationRecord[]> {
    const startTime = Date.now();
    
    try {
      logDebug('Sending notification', {
        userId: payload.userId,
        category: payload.category,
        types: payload.types || DEFAULT_NOTIFICATION_TYPES,
      });

      // Load user notification preferences
      const preferences = await this.getNotificationPreferences(payload.userId);
      
      // Bail if user unsubscribed from all
      if (preferences.unsubscribeAll) {
        logDebug('User unsubscribed from notifications', { userId: payload.userId });
        return [];
      }

      // Check category is enabled
      if (!this.isCategoryEnabled(payload.category, preferences)) {
        logDebug('Notification category disabled for user', {
          userId: payload.userId,
          category: payload.category,
        });
        return [];
      }

      // Resolve channels to send
      const notificationTypes = payload.types || DEFAULT_NOTIFICATION_TYPES;
      const results: NotificationRecord[] = [];

      // Send channels in parallel
      const notificationPromises = notificationTypes.map(type => 
        this.sendNotificationByType(type as any, payload)
      );

      const sendResults = await Promise.allSettled(notificationPromises);
      
      sendResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        } else if (result.status === 'rejected') {
          logError('Failed to send notification', result.reason as Error, {
            userId: payload.userId,
            type: notificationTypes[index],
          });
        }
      });

      // Audit log
      AuditLogger.logNotificationEvent('NOTIFICATION_SENT', payload.userId, {
        category: payload.category,
        types: notificationTypes,
        count: results.length,
      });

      logBusinessEvent('notification_sent', payload.userId, {
        category: payload.category,
        types: notificationTypes,
        successCount: results.length,
      });

      logDatabaseOperation('CREATE', 'notifications', Date.now() - startTime, results.length > 0);

      return results;
    } catch (error) {
      logError('Error sending notification', error as Error, {
        userId: payload.userId,
        category: payload.category,
      });
      throw error;
    }
  }

  /**
   * Deliver a notification for a single channel type.
   */
  private static async sendNotificationByType(
    type: 'email' | 'push' | 'in_app',
    payload: CreateNotificationPayload
  ): Promise<NotificationRecord | null> {
    const startTime = Date.now();
    
    try {
      // Create notification record
      const notification = await prisma.notification.create({
        data: {
          userId: payload.userId,
          type,
          category: payload.category,
          subject: payload.subject || null,
          title: payload.title,
          message: payload.message,
          data: payload.data as any,
          actionUrl: payload.actionUrl || null,
          priority: payload.priority || 'normal',
          status: 'pending',
        },
      });

      logDatabaseOperation('CREATE', 'notifications', Date.now() - startTime, true);

      // Dispatch by channel
      if (type === 'email') {
        await this.sendEmailNotification(notification, payload);
      } else if (type === 'push') {
        await this.sendPushNotification(notification, payload);
      } else if (type === 'in_app') {
        // in_app: persist only, no external send
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'delivered', deliveredAt: new Date() },
        });
      }

      // Return notification record
      return await prisma.notification.findUnique({
        where: { id: notification.id },
      }) as NotificationRecord;
    } catch (error) {
      logError(`Failed to send ${type} notification`, error as Error, {
        userId: payload.userId,
      });
      throw error;
    }
  }

  /**
   * Send email notification.
   */
  private static async sendEmailNotification(
    notification: any,
    payload: CreateNotificationPayload
  ): Promise<void> {
    try {
      // Integrate email provider here (Resend API)
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { email: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Call email service
    //   const result = await emailService.send({
    //     to: user.email,
    //     subject: payload.subject,
    //     html: payload.message,
    //   });

      // Update notification status
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });

      logDebug('Email notification sent', { notificationId: notification.id });
    } catch (error) {
      await prisma.notification.update({
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
   * Send push notification.
   */
  private static async sendPushNotification(
    notification: any,
    payload: CreateNotificationPayload
  ): Promise<void> {
    try {
      // Integrate push provider here (e.g. Firebase Messaging)
      // const result = await pushService.send({
      //   userId: payload.userId,
      //   title: payload.title,
      //   body: payload.message,
      //   data: payload.data,
      // });

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });

      logDebug('Push notification sent', { notificationId: notification.id });
    } catch (error) {
      await prisma.notification.update({
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
   * List notifications for a user.
   */
  static async getNotifications(
    userId: string,
    options: NotificationQueryOptions = {}
  ): Promise<{ notifications: NotificationRecord[]; total: number }> {
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    try {
      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
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
        prisma.notification.count({
          where: {
            userId,
            ...(options.status && { status: options.status }),
            ...(options.category && { category: options.category }),
          },
        }),
      ]);

      return {
        notifications: notifications as NotificationRecord[],
        total,
      };
    } catch (error) {
      logError('Failed to fetch notifications', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Mark a notification as read.
   */
  static async markAsRead(notificationId: string, userId: string): Promise<NotificationRecord> {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification || notification.userId !== userId) {
        throw new Error('Notification not found');
      }

      const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: 'read',
          readAt: new Date(),
        },
      });

      return updated as NotificationRecord;
    } catch (error) {
      logError('Failed to mark notification as read', error as Error, {
        notificationId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Delete a notification.
   */
  static async deleteNotification(notificationId: string, userId: string): Promise<void> {
    try {
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification || notification.userId !== userId) {
        throw new Error('Notification not found');
      }

      await prisma.notification.delete({
        where: { id: notificationId },
      });

      logDebug('Notification deleted', {
        notificationId,
        userId,
      });
    } catch (error) {
      logError('Failed to delete notification', error as Error, {
        notificationId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get user notification preferences (creates defaults if missing).
   */
  static async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      let prefs = await prisma.notificationPreferences.findUnique({
        where: { userId },
      });

      // Create default preferences if missing
      if (!prefs) {
        prefs = await prisma.notificationPreferences.create({
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
    } catch (error) {
      logError('Failed to fetch notification preferences', error as Error, { userId });
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
   * Update user notification preferences.
   */
  static async updateNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    try {
      // Ensure preferences row exists
      let existing = await prisma.notificationPreferences.findUnique({
        where: { userId },
      });

      if (!existing) {
        existing = await prisma.notificationPreferences.create({
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

      const updated = await prisma.notificationPreferences.update({
        where: { userId },
        data: preferences,
      });

      logBusinessEvent('notification_preferences_updated', userId, {
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
    } catch (error) {
      logError('Failed to update notification preferences', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Whether a notification category is enabled for the user.
   */
  private static isCategoryEnabled(
    category: string,
    preferences: NotificationPreferences
  ): boolean {
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
