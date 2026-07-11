import { Response } from 'express';
/**
 * 路由：POST /api/admin/secret-login
 * 使用管理員密鑰登入
 *
 * 請求標頭：
 *   X-Admin-Secret: admin_secret_key
 *
 * 回應內容：
 *   {
 *     "status": "success",
 *     "message": "Secret login successful",
 *     "data": {
 *       "expiresIn": 86400
 *     }
 *   }
 *
 * 注意：
 *   - JWT 權杖已設置在 HTTPOnly、Secure Cookie 中（名稱：adminToken）
 *   - 用密鑰登入與用 email/password 登入派發相同權杖
 *   - 後續請求自動帶上此 Cookie
 */
export declare const secretLogin: (req: any, res: Response) => Promise<void>;
/**
 * 路由：POST /api/admin/login
 * 管理員登入
 *
 * 請求內容：
 *   {
 *     "email": "admin@example.com",
 *     "password": "admin_password"
 *   }
 *
 * 回應內容：
 *   {
 *     "status": "success",
 *     "message": "Admin login successful",
 *     "data": {
 *       "expiresIn": 86400,
 *       "admin": {
 *         "id": "admin_123",
 *         "email": "admin@example.com",
 *         "name": "Admin Name",
 *         "role": "admin"
 *       }
 *     }
 *   }
 *
 * 注意：
 *   - JWT 權杖已設置在 HTTPOnly、Secure Cookie 中（名稱：adminToken）
 *   - 客戶端須啟用 Cookie 儲存和自動傳送功能
 */
export declare const adminLogin: (req: any, res: Response) => Promise<void>;
/**
 * 路由：GET /api/admin/users
 * 查看所有用戶資料
 *
 * 請求標頭：
 *   X-Admin-Token: 管理員 JWT 權杖
 *
 * 查詢參數：
 *   limit: 返回的用戶數量 (預設: 100, 最大: 1000)
 *   offset: 分頁偏移量 (預設: 0)
 *   sortBy: 排序欄位 (createdAt | email, 預設: createdAt)
 *   order: 排序順序 (asc | desc, 預設: desc)
 *
 * 回應內容：
 *   {
 *     "status": "success",
 *     "data": {
 *       "total": 150,
 *       "users": [...]
 *     }
 *   }
 */
export declare const getAllUsers: (req: any, res: Response) => Promise<void>;
/**
 * 路由：DELETE /api/admin/users/:userId
 * 刪除用戶
 *
 * 請求標頭：
 *   X-Admin-Token: 管理員 JWT 權杖
 *
 * 回應內容：
 *   {
 *     "status": "success",
 *     "message": "User deleted successfully",
 *     "data": {
 *       "userId": "user_123",
 *       "email": "user@example.com"
 *     }
 *   }
 */
export declare const deleteUser: (req: any, res: Response) => Promise<void>;
/**
 * 路由：PUT /api/admin/users/:userId/tier
 * 修改用戶等級
 *
 * 請求標頭：
 *   X-Admin-Token: 管理員 JWT 權杖
 *
 * 請求內容：
 *   { "tier": "Pro" | "Ultimate" | "VIP" | "Basic" }
 *
 * 回應內容：
 *   {
 *     "status": "success",
 *     "message": "User tier updated successfully",
 *     "data": {...}
 *   }
 */
export declare const updateUserTierAdmin: (req: any, res: Response) => Promise<void>;
/**
 * 路由：GET /api/admin/users/:userId/tier
 * 查詢用戶的當前訂閱等級
 *
 * 請求標頭：
 *   X-Admin-Token: 管理員 JWT 權杖
 *
 * 回應內容：
 *   {
 *     "status": "success",
 *     "data": {
 *       "userId": "user_123",
 *       "tier": "Pro",
 *       "email": "user@example.com"
 *     }
 *   }
 */
export declare const getUserTierAdmin: (req: any, res: Response) => Promise<void>;
/**
 * ==========================================
 * 管理員帳戶管理端點（需 X-Admin-Secret 驗證）
 * ==========================================
 */
export declare const createAdmin: (req: any, res: Response) => Promise<void>;
export declare const updateAdmin: (req: any, res: Response) => Promise<void>;
export declare const deleteAdmin: (req: any, res: Response) => Promise<void>;
export declare const listAdmins: (req: any, res: Response) => Promise<void>;
//# sourceMappingURL=adminController.d.ts.map