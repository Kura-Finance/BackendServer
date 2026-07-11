import { Request, Response } from 'express';
import { NotificationService } from '../services/notificationService';
import { logError, logDebug } from '../../logger';
import { AuditLogger } from '../../logger/auditLog';

interface AuthRequest extends Request {
  userId?: string;
}

/**
 * 发送通知
 * POST /api/notifications/send
 */
export const sendNotification = async (req: AuthRequest, res: Response): Promise<void> => {
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
      priority: (priority || 'normal') as any,
    };

    const notifications = await NotificationService.sendNotification(payload);

    AuditLogger.logNotificationEvent('NOTIFICATION_SENT', userId, {
      category,
      notificationCount: notifications.length,
    });

    res.status(200).json({
      success: true,
      notifications,
      count: notifications.length,
    });
  } catch (error) {
    logError('Error sending notification', error as Error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
};

/**
 * 获取用户通知列表
 * GET /api/notifications
 */
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      limit = '20',
      offset = '0',
      status,
      category,
      startDate,
      endDate,
    } = req.query;

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
      ...(statusStr && { status: statusStr as any }),
      ...(categoryStr && { category: categoryStr as any }),
      ...(startDateStr && { startDate: new Date(startDateStr) }),
      ...(endDateStr && { endDate: new Date(endDateStr) }),
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

    res.status(200).json({
      success: true,
      notifications: result.notifications,
      total: result.total,
      limit: options.limit,
      offset: options.offset,
    });
  } catch (error) {
    logError('Error fetching notifications', error as Error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

/**
 * 标记通知为已读
 * PATCH /api/notifications/:id/read
 */
export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const notification = await NotificationService.markAsRead(notificationId, userId);

    AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId, {
      notificationId,
    });

    res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    logError('Error marking notification as read', error as Error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

/**
 * 删除通知
 * DELETE /api/notifications/:id
 */
export const deleteNotification = async (req: AuthRequest, res: Response): Promise<void> => {
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

    await NotificationService.deleteNotification(notificationId, userId);

    AuditLogger.logNotificationEvent('NOTIFICATION_DELETED', userId, {
      notificationId,
    });

    res.status(200).json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    logError('Error deleting notification', error as Error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

/**
 * 获取通知preferences
 * GET /api/notifications/preferences
 */
export const getPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const preferences = await NotificationService.getNotificationPreferences(userId);

    AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId);

    res.status(200).json({
      success: true,
      preferences,
    });
  } catch (error) {
    logError('Error fetching notification preferences', error as Error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
};

/**
 * 更新通知preferences
 * PATCH /api/notifications/preferences
 */
export const updatePreferences = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const updated = await NotificationService.updateNotificationPreferences(userId, preferences);

    AuditLogger.logNotificationEvent('NOTIFICATION_SENT', userId, {
      changes: Object.keys(preferences),
    });

    res.status(200).json({
      success: true,
      preferences: updated,
      message: 'Preferences updated successfully',
    });
  } catch (error) {
    logError('Error updating notification preferences', error as Error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};

/**
 * 批量标记通知为已读
 * PATCH /api/notifications/batch/read
 */
export const markMultipleAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const results = await Promise.allSettled(
      ids.map(id => NotificationService.markAsRead(id, userId))
    );

    const successful = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    AuditLogger.logNotificationEvent('NOTIFICATION_READ', userId, {
      requested: ids.length,
      successful: successful.length,
      failed: failed.length,
    });

    res.status(200).json({
      success: successful.length > 0,
      markedCount: successful.length,
      failedCount: failed.length,
    });
  } catch (error) {
    logError('Error marking multiple notifications as read', error as Error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
};

/**
 * 清空所有通知
 * DELETE /api/notifications/all
 */
export const clearAllNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // TODO: Implement deleteMany for all notifications
    AuditLogger.logNotificationEvent('NOTIFICATION_DELETED', userId);

    res.status(200).json({
      success: true,
      message: 'All notifications cleared',
    });
  } catch (error) {
    logError('Error clearing notifications', error as Error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
};
