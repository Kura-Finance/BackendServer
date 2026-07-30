/**
 * Notification domain — preferences, delivery, and in-app notification records.
 *
 * Components: models/types, notificationService, notificationController, router.
 */

export { NotificationService } from './services/notificationService';
export { notificationRouter } from './router';

// Re-export types for consumers
export * from './models/types';
