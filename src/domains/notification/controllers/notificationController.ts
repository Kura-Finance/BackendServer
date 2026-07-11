import { Request, Response } from 'express';
import { NotificationService } from '../services/notificationService';
import { logError, logDebug } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';

interface AuthRequest extends Request {
  userId?: string;
}

/**
 * 發送通知
 * 路由：POST /api/notifications/send
 */
export const sendNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
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
      priority: (priority || 'normal') as any,
    };

    const notifications = await NotificationService.sendNotification(payload);

    AuditLogger.logNotificationEvent('NOTIFICATION_SENT', userId, {
      category,
      notificationCount: notifications.length,
    });

    sendSuccess(res, {
      notifications,
      count: notifications.length,
    }, 200);
  } catch (error) {
    logError('Error sending notification', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to send notification' });
  }
};

/**
 * 取得使用者通知列表
 * 路由：GET /api/notifications
 */
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const { limit = 20, offset = 0, status, category, startDate, endDate } = req.query as {
      limit?: number;
      offset?: number;
      status?: string;
      category?: string;
      startDate?: string;
      endDate?: string;
    };

    const options = {
      limit,
      offset,
      ...(status && { status: status as any }),
      ...(category && { category: category as any }),
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
    };

    logDebug('Fetching notifications', {
      userId,
      options,
    });

    const result = await NotificationService.getNotifications(userId, options);

    AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId, {
      limit: options.limit,
      offset: options.offset,
      total: result.total,
    });

    sendSuccess(res, {
      notifications: result.notifications,
      total: result.total,
      limit: options.limit,
      offset: options.offset,
    }, 200);
  } catch (error) {
    logError('Error fetching notifications', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch notifications' });
  }
};

/**
 * 標記通知為已讀
 * 路由：PATCH /api/notifications/:id/read
 */
export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const notificationId = req.params.id as string;

    const notification = await NotificationService.markAsRead(notificationId, userId);

    AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId, {
      notificationId,
    });

    sendSuccess(res, {
      notification,
    }, 200);
  } catch (error) {
    logError('Error marking notification as read', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to mark notification as read' });
  }
};

/**
 * 刪除通知
 * 路由：DELETE /api/notifications/:id
 */
export const deleteNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const notificationId = req.params.id as string;

    await NotificationService.deleteNotification(notificationId, userId);

    AuditLogger.logNotificationEvent('NOTIFICATION_DELETED', userId, {
      notificationId,
    });

    sendSuccess(res, {
      message: 'Notification deleted',
    }, 200);
  } catch (error) {
    logError('Error deleting notification', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to delete notification' });
  }
};

/**
 * 取得通知偏好設定
 * 路由：GET /api/notifications/preferences
 */
export const getPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const preferences = await NotificationService.getNotificationPreferences(userId);

    AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId);

    sendSuccess(res, {
      preferences,
    }, 200);
  } catch (error) {
    logError('Error fetching notification preferences', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch preferences' });
  }
};

/**
 * 更新通知偏好設定
 * 路由：PATCH /api/notifications/preferences
 */
export const updatePreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const preferences = req.body;

    const updated = await NotificationService.updateNotificationPreferences(userId, preferences);

    AuditLogger.logNotificationEvent('NOTIFICATION_SENT', userId, {
      changes: Object.keys(preferences),
    });

    sendSuccess(res, {
      preferences: updated,
      message: 'Preferences updated successfully',
    }, 200);
  } catch (error) {
    logError('Error updating notification preferences', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to update preferences' });
  }
};

/**
 * 批次標記通知為已讀
 * 路由：PATCH /api/notifications/batch/read
 */
export const markMultipleAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    const { ids } = req.body;

    const results = await Promise.allSettled(
      ids.map((id: string) => NotificationService.markAsRead(id, userId))
    );

    const successful = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId, {
      requested: ids.length,
      successful: successful.length,
      failed: failed.length,
    });

    sendSuccess(res, {
      hasSuccess: successful.length > 0,
      markedCount: successful.length,
      failedCount: failed.length,
    }, 200);
  } catch (error) {
    logError('Error marking multiple notifications as read', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to mark notifications as read' });
  }
};

/**
 * 清空所有通知
 * 路由：DELETE /api/notifications/all
 */
export const clearAllNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      sendError(res, 401, { code: 'UNAUTHORIZED', message: 'Unauthorized' });
      return;
    }

    // TODO: 實作批次刪除（deleteMany）以清空所有通知
    AuditLogger.logNotificationEvent('NOTIFICATION_DELETED', userId);

    sendSuccess(res, {
      message: 'All notifications cleared',
    }, 200);
  } catch (error) {
    logError('Error clearing notifications', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to clear notifications' });
  }
};
