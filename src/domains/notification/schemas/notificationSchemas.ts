import { z } from 'zod';

const notificationCategorySchema = z.enum([
  'price_alert',
  'account_activity',
  'transaction',
  'system_alert',
  'security',
]);

const notificationStatusSchema = z.enum([
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
]);

export const sendNotificationBodySchema = z.object({
  types: z.array(z.enum(['email', 'push', 'in_app'])).min(1).optional(),
  category: notificationCategorySchema,
  subject: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1, 'title is required'),
  message: z.string().trim().min(1, 'message is required'),
  data: z.record(z.string(), z.unknown()).optional(),
  actionUrl: z.string().trim().url('actionUrl must be a valid URL').optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

export const getNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  status: notificationStatusSchema.optional(),
  category: notificationCategorySchema.optional(),
  startDate: z.string().datetime({ message: 'startDate must be ISO datetime' }).optional(),
  endDate: z.string().datetime({ message: 'endDate must be ISO datetime' }).optional(),
});

export const notificationIdParamsSchema = z.object({
  id: z.string().trim().min(1, 'notification id is required'),
});

export const updatePreferencesBodySchema = z
  .object({
    enableEmailNotifications: z.boolean().optional(),
    enablePushNotifications: z.boolean().optional(),
    enableInAppNotifications: z.boolean().optional(),
    priceAlertThreshold: z.number().min(0).max(100).optional(),
    accountActivityAlerts: z.boolean().optional(),
    transactionAlerts: z.boolean().optional(),
    systemAlerts: z.boolean().optional(),
    securityAlerts: z.boolean().optional(),
    unsubscribeAll: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'preferences object cannot be empty',
  });

export const markMultipleAsReadBodySchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, 'ids array must not be empty'),
});
