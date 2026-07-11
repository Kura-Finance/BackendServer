import { Router } from 'express';
import {
  sendNotification,
  getNotifications,
  markAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences,
  markMultipleAsRead,
  clearAllNotifications,
} from './controllers/notificationController';

/**
 * Notification Router
 * 通知系统路由
 * Base: /api/notifications
 */
const router = Router();

/**
 * 获取通知preferences
 * GET /api/notifications/preferences
 */
router.get('/preferences', getPreferences);

/**
 * 更新通知preferences
 * PATCH /api/notifications/preferences
 * Body: { enableEmailNotifications, enablePushNotifications, ..., priceAlertThreshold }
 */
router.patch('/preferences', updatePreferences);

/**
 * 批量标记通知为已读
 * PATCH /api/notifications/batch/read
 * Body: { ids: string[] }
 */
router.patch('/batch/read', markMultipleAsRead);

/**
 * 清空所有通知
 * DELETE /api/notifications/all
 */
router.delete('/all', clearAllNotifications);

/**
 * 发送通知
 * POST /api/notifications/send
 * Body: { types?, category, subject?, title, message, data?, actionUrl?, priority? }
 */
router.post('/send', sendNotification);

/**
 * 获取用户通知列表
 * GET /api/notifications?limit=20&offset=0&status=sent&category=price_alert
 * Query: limit, offset, status, category, startDate, endDate
 */
router.get('/', getNotifications);

/**
 * 标记单个通知为已读
 * PATCH /api/notifications/:id/read
 */
router.patch('/:id/read', markAsRead);

/**
 * 删除单个通知
 * DELETE /api/notifications/:id
 */
router.delete('/:id', deleteNotification);

export const notificationRouter = router;
