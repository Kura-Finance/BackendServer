/** Notification HTTP routes. Base path: /api/notifications */

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

const router = Router();

// All notification routes require auth
router.use(requireAuth);

/**
 * GET /api/notifications/preferences — notification preferences.
 */
router.get('/preferences', getPreferences);

/**
 * PATCH /api/notifications/preferences
 * Body: { enableEmailNotifications, enablePushNotifications, ..., priceAlertThreshold }
 */
router.patch('/preferences', validateRequest({ body: updatePreferencesBodySchema }), updatePreferences);

/**
 * PATCH /api/notifications/batch/read — mark many as read. Body: { ids: string[] }
 */
router.patch('/batch/read', validateRequest({ body: markMultipleAsReadBodySchema }), markMultipleAsRead);

/**
 * DELETE /api/notifications/all — clear all notifications.
 */
router.delete('/all', clearAllNotifications);

/**
 * POST /api/notifications/send
 * Body: { types?, category, subject?, title, message, data?, actionUrl?, priority? }
 */
router.post('/send', validateRequest({ body: sendNotificationBodySchema }), sendNotification);

/**
 * GET /api/notifications — list notifications.
 * Query: limit, offset, status, category, startDate, endDate
 */
router.get('/', validateRequest({ query: getNotificationsQuerySchema }), getNotifications);

/**
 * PATCH /api/notifications/:id/read — mark one notification as read.
 */
router.patch('/:id/read', validateRequest({ params: notificationIdParamsSchema }), markAsRead);

/**
 * DELETE /api/notifications/:id — delete one notification.
 */
router.delete('/:id', validateRequest({ params: notificationIdParamsSchema }), deleteNotification);

export const notificationRouter = router;
