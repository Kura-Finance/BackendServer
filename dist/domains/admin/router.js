"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminController_1 = require("./controllers/adminController");
const logger_1 = require("../logger");
const router = (0, express_1.Router)();
/**
 * 錯誤處理中間件
 */
const wrapAsync = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            logger_1.appLogger.error('Admin route error', error);
            res.status(500).json({ error: 'Internal server error' });
        });
    };
};
/**
 * 路由：POST /api/admin/login
 * 管理員登入
 *
 * 請求內容：
 *   { "email": "admin@example.com", "password": "password" }
 *
 * 注意：
 *   - JWT 權杖已設置在 HTTPOnly、Secure Cookie 中（名稱：adminToken）
 *   - 後續請求會自動帶上此 Cookie
 */
router.post('/login', wrapAsync(adminController_1.adminLogin));
/**
 * 路由：POST /api/admin/secret-login
 * 使用管理員密鑰登入
 *
 * 請求標頭：
 *   X-Admin-Secret: admin_secret_key
 *
 * 注意：
 *   - JWT 權杖已設置在 HTTPOnly、Secure Cookie 中（名稱：adminToken）
 *   - 派發與 /login 相同的權杖，但無需管理員帳號
 */
router.post('/secret-login', wrapAsync(adminController_1.secretLogin));
/**
 * 路由：GET /api/admin/users
 * 查看所有用戶資料
 *
 * 驗證方式：
 *   僅允許用 email/password 登入的管理員
 *   Cookie: adminToken (自動發送)
 *   或標頭：X-Admin-Token
 *
 * 查詢參數：
 *   limit, offset, sortBy, order
 */
router.get('/users', wrapAsync(adminController_1.getAllUsers));
/**
 * 路由：DELETE /api/admin/users/:userId
 * 刪除用戶
 *
 * 驗證方式：
 *   僅允許用 email/password 登入的管理員
 *   Cookie: adminToken (自動發送)
 *   或標頭：X-Admin-Token
 */
router.delete('/users/:userId', wrapAsync(adminController_1.deleteUser));
/**
 * 路由：PUT /api/admin/users/:userId/tier
 * 修改用戶等級
 *
 * 驗證方式：
 *   僅允許用 email/password 登入的管理員
 *   Cookie: adminToken (自動發送)
 *   或標頭：X-Admin-Token
 *
 * 請求內容：
 *   { "tier": "Pro" | "Ultimate" | "VIP" | "Basic" }
 */
router.put('/users/:userId/tier', wrapAsync(adminController_1.updateUserTierAdmin));
/**
 * 路由：GET /api/admin/users/:userId/tier
 * 查詢用戶訂閱等級
 *
 * 驗證方式：
 *   僅允許用 email/password 登入的管理員
 *   Cookie: adminToken (自動發送)
 *   或標頭：X-Admin-Token
 */
router.get('/users/:userId/tier', wrapAsync(adminController_1.getUserTierAdmin));
/**
 * ==========================================
 * 管理員帳戶管理（需密鑰登入的權杖）
 * ==========================================
 */
/**
 * 路由：POST /api/admin/admins
 * 創建新管理員帳戶
 *
 * 驗證方式：
 *   僅允許用 Secret 登入的管理員
 *   Cookie: adminToken (自動發送)
 *   或標頭：X-Admin-Token
 */
router.post('/admins', wrapAsync(adminController_1.createAdmin));
/**
 * 路由：PUT /api/admin/admins/:adminId
 * 修改管理員帳戶
 *
 * 驗證方式：
 *   僅允許用 Secret 登入的管理員
 *   Cookie: adminToken (自動發送)
 *   或標頭：X-Admin-Token
 */
router.put('/admins/:adminId', wrapAsync(adminController_1.updateAdmin));
/**
 * 路由：DELETE /api/admin/admins/:adminId
 * 刪除管理員帳戶
 *
 * 驗證方式：
 *   僅允許用 Secret 登入的管理員
 *   Cookie: adminToken (自動發送)
 *   或標頭：X-Admin-Token
 */
router.delete('/admins/:adminId', wrapAsync(adminController_1.deleteAdmin));
/**
 * 路由：GET /api/admin/admins
 * 列出所有管理員帳戶
 *
 * 驗證方式：
 *   僅允許用 Secret 登入的管理員
 *   Cookie: adminToken (自動發送)
 *   或標頭：X-Admin-Token
 */
router.get('/admins', wrapAsync(adminController_1.listAdmins));
exports.default = router;
//# sourceMappingURL=router.js.map