import { Router } from 'express';
import { requireAuth } from '../auth/middleware/auth';
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
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  getNotificationsQuerySchema,
  markMultipleAsReadBodySchema,
  notificationIdParamsSchema,
  sendNotificationBodySchema,
  updatePreferencesBodySchema,
} from './schemas/notificationSchemas';

/**
 * 通知路由
 * 通知系統路由
 * 基礎路徑：/api/notifications
 */
const router = Router();

// 所有通知路由都需要驗證
router.use(requireAuth);

/**
 * 取得通知偏好設定
 * 路由：GET /api/notifications/preferences
 */
router.get('/preferences', getPreferences);

/**
 * 更新通知偏好設定
 * 路由：PATCH /api/notifications/preferences
 * 請求內容：{ enableEmailNotifications, enablePushNotifications, ..., priceAlertThreshold }
 */
router.patch('/preferences', validateRequest({ body: updatePreferencesBodySchema }), updatePreferences);

/**
 * 批次標記通知為已讀
 * 路由：PATCH /api/notifications/batch/read
 * 請求內容：{ ids: string[] }
 */
router.patch('/batch/read', validateRequest({ body: markMultipleAsReadBodySchema }), markMultipleAsRead);

/**
 * 清空所有通知
 * 路由：DELETE /api/notifications/all
 */
router.delete('/all', clearAllNotifications);

/**
 * 發送通知
 * 路由：POST /api/notifications/send
 * 請求內容：{ types?, category, subject?, title, message, data?, actionUrl?, priority? }
 */
router.post('/send', validateRequest({ body: sendNotificationBodySchema }), sendNotification);

/**
 * 取得使用者通知列表
 * 路由：GET /api/notifications?limit=20&offset=0&status=sent&category=price_alert
 * 查詢參數：limit、offset、status、category、startDate、endDate
 */
router.get('/', validateRequest({ query: getNotificationsQuerySchema }), getNotifications);

/**
 * 標記單一通知為已讀
 * 路由：PATCH /api/notifications/:id/read
 */
router.patch('/:id/read', validateRequest({ params: notificationIdParamsSchema }), markAsRead);

/**
 * 刪除單一通知
 * 路由：DELETE /api/notifications/:id
 */
router.delete('/:id', validateRequest({ params: notificationIdParamsSchema }), deleteNotification);

export const notificationRouter = router;
