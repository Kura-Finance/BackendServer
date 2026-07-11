import { Request, Response } from 'express';
interface AuthRequest extends Request {
    userId?: string;
}
/**
 * 发送通知
 * POST /api/notifications/send
 */
export declare const sendNotification: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 获取用户通知列表
 * GET /api/notifications
 */
export declare const getNotifications: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 标记通知为已读
 * PATCH /api/notifications/:id/read
 */
export declare const markAsRead: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 删除通知
 * DELETE /api/notifications/:id
 */
export declare const deleteNotification: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 获取通知preferences
 * GET /api/notifications/preferences
 */
export declare const getPreferences: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 更新通知preferences
 * PATCH /api/notifications/preferences
 */
export declare const updatePreferences: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 批量标记通知为已读
 * PATCH /api/notifications/batch/read
 */
export declare const markMultipleAsRead: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 清空所有通知
 * DELETE /api/notifications/all
 */
export declare const clearAllNotifications: (req: AuthRequest, res: Response) => Promise<void>;
export {};
//# sourceMappingURL=notificationController.d.ts.map