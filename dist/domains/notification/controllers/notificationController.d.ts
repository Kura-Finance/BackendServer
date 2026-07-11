import { Request, Response } from 'express';
interface AuthRequest extends Request {
    userId?: string;
}
/**
 * 發送通知
 * 路由：POST /api/notifications/send
 */
export declare const sendNotification: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 取得使用者通知列表
 * 路由：GET /api/notifications
 */
export declare const getNotifications: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 標記通知為已讀
 * 路由：PATCH /api/notifications/:id/read
 */
export declare const markAsRead: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 刪除通知
 * 路由：DELETE /api/notifications/:id
 */
export declare const deleteNotification: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 取得通知偏好設定
 * 路由：GET /api/notifications/preferences
 */
export declare const getPreferences: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 更新通知偏好設定
 * 路由：PATCH /api/notifications/preferences
 */
export declare const updatePreferences: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 批次標記通知為已讀
 * 路由：PATCH /api/notifications/batch/read
 */
export declare const markMultipleAsRead: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * 清空所有通知
 * 路由：DELETE /api/notifications/all
 */
export declare const clearAllNotifications: (req: AuthRequest, res: Response) => Promise<void>;
export {};
//# sourceMappingURL=notificationController.d.ts.map