"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAdmins = exports.deleteAdmin = exports.updateAdmin = exports.createAdmin = exports.getUserTierAdmin = exports.updateUserTierAdmin = exports.deleteUser = exports.getAllUsers = exports.adminLogin = exports.secretLogin = void 0;
const apiRateLimitUtil_1 = require("../../shared/lib/apiRateLimitUtil");
const logger_1 = require("../../logger");
const prisma_1 = require("../../shared/lib/prisma");
const emailService_1 = require("../../email/emailService");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
/**
 * 驗證內部管理員密鑰（用於管理員帳戶管理）
 * 發送方式：Header `X-Admin-Secret`
 */
const getAdminSecret = () => {
    return process.env.ADMIN_SECRET_KEY;
};
const verifyAdminSecret = (providedSecret) => {
    const expectedSecret = getAdminSecret();
    if (!expectedSecret) {
        return false;
    }
    return providedSecret === expectedSecret;
};
/**
 * 驗證管理員權杖（用於常規管理操作）
 * 發送方式：Cookie `adminToken` 或 Header `X-Admin-Token`
 */
const getAdminTokenFromRequest = (req) => {
    // 優先從請求標頭讀取
    const headerToken = req.header('X-Admin-Token');
    if (headerToken) {
        (0, logger_1.logDebug)('Admin token found in X-Admin-Token header', { hasToken: true });
        return headerToken;
    }
    // 其次從 Cookie 讀取
    if (req.cookies && req.cookies.adminToken) {
        (0, logger_1.logDebug)('Admin token found in adminToken cookie', {
            cookieExists: true,
            cookieLength: req.cookies.adminToken.length,
        });
        return req.cookies.adminToken;
    }
    (0, logger_1.logDebug)('No admin token found', {
        hasHeader: !!req.header('X-Admin-Token'),
        hasCookie: !!req.cookies?.adminToken,
        cookies: Object.keys(req.cookies || {}),
    });
    return null;
};
const verifyAdminToken = (token) => {
    try {
        const secret = process.env.JWT_SECRET || 'secret';
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        return decoded.isAdmin === true;
    }
    catch (error) {
        return false;
    }
};
/**
 * 從 token 中提取管理員信息
 */
const getAdminFromToken = (token) => {
    try {
        const secret = process.env.JWT_SECRET || 'secret';
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        if (decoded.isAdmin === true) {
            return decoded;
        }
        return null;
    }
    catch (error) {
        return null;
    }
};
/**
 * 驗證 Token 並檢查權限
 */
const verifyAdminTokenWithPermission = (req, requiredLoginMethod) => {
    const adminToken = getAdminTokenFromRequest(req);
    if (!adminToken || !verifyAdminToken(adminToken)) {
        return null;
    }
    const tokenInfo = getAdminFromToken(adminToken);
    if (!tokenInfo) {
        return null;
    }
    // 檢查登入方式欄位 loginMethod
    if (tokenInfo.loginMethod !== requiredLoginMethod) {
        return null;
    }
    return tokenInfo;
};
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
const secretLogin = async (req, res) => {
    try {
        const adminSecret = req.header('X-Admin-Secret');
        if (!adminSecret || !verifyAdminSecret(adminSecret)) {
            (0, logger_1.logDebug)('Secret login failed: invalid secret', {
                ip: req.ip,
            });
            res.status(401).json({ error: 'Invalid admin secret' });
            return;
        }
        // 生成 JWT 權杖（無須連接任何特定管理員帳戶）
        const secret = process.env.JWT_SECRET || 'secret';
        const expiresIn = 24 * 60 * 60; // 24 小時
        const adminToken = jsonwebtoken_1.default.sign({
            isAdmin: true,
            adminId: 'secret-auth',
            adminEmail: 'secret-auth',
            adminRole: 'admin',
            loginMethod: 'secret', // 標記為 Secret 登入
            iat: Date.now(),
        }, secret, { expiresIn });
        (0, logger_1.logBusinessEvent)('secret_login_successful', 'system', {
            ip: req.ip
        });
        // 發送通知郵件
        await emailService_1.EmailService.sendAdminOperationEmail('Secret 登入', {
            'IP 地址': req.ip,
            '時間': new Date().toLocaleString('zh-TW'),
            '狀態': '成功',
        });
        // 設定 Cookie（HTTPOnly、Secure）
        const isProduction = process.env.NODE_ENV === 'production';
        const expiresInMs = expiresIn * 1000; // 轉換為毫秒
        res.cookie('adminToken', adminToken, {
            httpOnly: true, // 防止 JavaScript 訪問
            secure: isProduction, // 生產環境強制 HTTPS
            sameSite: isProduction ? 'strict' : 'lax', // 開發環境用 lax，生產用 strict
            maxAge: expiresInMs,
            path: '/api/admin',
            signed: false, // 不簽名 cookie
        });
        (0, logger_1.logDebug)('Admin token cookie set', {
            secure: isProduction,
            maxAge: expiresInMs,
            sameSite: isProduction ? 'strict' : 'lax', // 開發環境用 lax，生產用 strict
            path: '/api/admin',
            signed: false, // 不簽名 cookie
        });
        (0, logger_1.logDebug)('Admin token cookie set', {
            secure: isProduction,
            maxAge: expiresInMs,
            sameSite: isProduction ? 'strict' : 'lax',
        });
        res.json({
            status: 'success',
            message: 'Secret login successful',
            data: {
                expiresIn,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Secret login failed', error);
        res.status(500).json({ error: error.message || 'Login failed' });
    }
};
exports.secretLogin = secretLogin;
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
const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'email and password are required' });
            return;
        }
        // 從數據庫查詢管理員帳戶
        const admin = await prisma_1.prisma.admin.findUnique({
            where: { email },
            select: { id: true, email: true, password: true, name: true, role: true, isActive: true },
        });
        if (!admin) {
            (0, logger_1.logDebug)('Admin login failed: admin not found', {
                email,
                ip: req.ip,
            });
            res.status(401).json({ error: 'Invalid admin credentials' });
            return;
        }
        // 檢查帳戶是否啟用
        if (!admin.isActive) {
            (0, logger_1.logDebug)('Admin login failed: admin account disabled', {
                email,
                ip: req.ip,
            });
            res.status(401).json({ error: 'Admin account is disabled' });
            return;
        }
        // 驗證密碼
        const passwordMatch = await bcryptjs_1.default.compare(password, admin.password);
        if (!passwordMatch) {
            (0, logger_1.logDebug)('Admin login failed: invalid password', {
                email,
                ip: req.ip,
            });
            res.status(401).json({ error: 'Invalid admin credentials' });
            return;
        }
        // 生成 JWT 權杖
        const secret = process.env.JWT_SECRET || 'secret';
        const expiresIn = 24 * 60 * 60; // 24 小時
        const adminToken = jsonwebtoken_1.default.sign({
            isAdmin: true,
            adminId: admin.id,
            adminEmail: admin.email,
            adminRole: admin.role,
            loginMethod: 'email', // 用帳戶密碼登入，只能管理用戶
            iat: Date.now(),
        }, secret, { expiresIn });
        (0, logger_1.logBusinessEvent)('admin_login_successful', admin.id, {
            email: admin.email,
            ip: req.ip
        });
        // 發送通知郵件
        await emailService_1.EmailService.sendAdminOperationEmail('管理員登入', {
            '管理員郵箱': admin.email,
            '管理員名稱': admin.name || 'N/A',
            'IP 地址': req.ip,
            '時間': new Date().toLocaleString('zh-TW'),
            '狀態': '成功',
        });
        // 設定 Cookie（HTTPOnly、Secure）
        const isProduction = process.env.NODE_ENV === 'production';
        const expiresInMs = expiresIn * 1000; // 轉換為毫秒
        res.cookie('adminToken', adminToken, {
            httpOnly: true, // 防止 JavaScript 訪問
            secure: isProduction, // 生產環境強制 HTTPS
            sameSite: isProduction ? 'strict' : 'lax', // 開發環境用 lax，生產用 strict
            maxAge: expiresInMs,
            path: '/api/admin',
            signed: false, // 不簽名 cookie
        });
        (0, logger_1.logDebug)('Admin token cookie set', {
            adminEmail: admin.email,
            secure: isProduction,
            maxAge: expiresInMs,
            sameSite: isProduction ? 'strict' : 'lax',
        });
        res.json({
            status: 'success',
            message: 'Admin login successful',
            data: {
                expiresIn,
                admin: {
                    id: admin.id,
                    email: admin.email,
                    name: admin.name,
                    role: admin.role,
                },
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Admin login failed', error);
        res.status(500).json({ error: error.message || 'Login failed' });
    }
};
exports.adminLogin = adminLogin;
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
const getAllUsers = async (req, res) => {
    try {
        // 驗證管理員權杖 Token - 僅允許用帳戶密碼登入的管理員
        const tokenInfo = verifyAdminTokenWithPermission(req, 'email');
        if (!tokenInfo) {
            (0, logger_1.logDebug)('Unauthorized admin request: get all users', {
                path: req.path,
                ip: req.ip,
            });
            res.status(403).json({ error: 'Only admin users can perform this action' });
            return;
        }
        // 分頁參數
        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
        const offset = parseInt(req.query.offset) || 0;
        const sortBy = req.query.sortBy || 'createdAt';
        const order = req.query.order || 'desc';
        // 驗證排序參數
        const validSortFields = ['createdAt', 'email'];
        const validOrders = ['asc', 'desc'];
        if (!validSortFields.includes(sortBy)) {
            res.status(400).json({ error: `Invalid sortBy. Must be one of: ${validSortFields.join(', ')}` });
            return;
        }
        if (!validOrders.includes(order)) {
            res.status(400).json({ error: `Invalid order. Must be one of: ${validOrders.join(', ')}` });
            return;
        }
        // 取得用戶總數
        const total = await prisma_1.prisma.user.count();
        // 取得用戶列表
        const users = await prisma_1.prisma.user.findMany({
            skip: offset,
            take: limit,
            orderBy: {
                [sortBy]: order,
            },
            select: {
                id: true,
                email: true,
                name: true,
                tier: true,
                emailVerified: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        // 回傳用戶列表（已包含 tier 資訊）
        const usersWithTier = users.map((user) => ({
            ...user,
            tier: user.tier || 'Basic',
        }));
        (0, logger_1.logBusinessEvent)('admin_view_all_users', 'admin', {
            limit,
            offset,
            totalReturned: users.length,
            totalCount: total,
        });
        res.json({
            status: 'success',
            data: {
                total,
                count: users.length,
                limit,
                offset,
                users: usersWithTier,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Admin: Get all users failed', error);
        res.status(500).json({ error: error.message || 'Failed to fetch users' });
    }
};
exports.getAllUsers = getAllUsers;
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
const deleteUser = async (req, res) => {
    try {
        // 驗證管理員權杖 Token - 僅允許用帳戶密碼登入的管理員
        const tokenInfo = verifyAdminTokenWithPermission(req, 'email');
        if (!tokenInfo) {
            (0, logger_1.logDebug)('Unauthorized admin request: delete user', {
                path: req.path,
                ip: req.ip,
            });
            res.status(403).json({ error: 'Only admin users can perform this action' });
            return;
        }
        const { userId } = req.params;
        if (!userId) {
            res.status(400).json({ error: 'userId is required in params' });
            return;
        }
        // 驗證用戶是否存在
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        // 刪除用戶（級聯刪除會自動移除相關的所有資料）
        await prisma_1.prisma.user.delete({
            where: { id: userId },
        });
        (0, logger_1.logBusinessEvent)('admin_user_deleted', userId, {
            userEmail: user.email,
            deletedAt: new Date().toISOString(),
        });
        // 發送通知郵件
        await emailService_1.EmailService.sendAdminOperationEmail('刪除用戶', {
            '用戶 ID': userId,
            '用戶郵箱': user.email,
            '操作者': tokenInfo.adminEmail,
            'IP 地址': req.ip,
            '時間': new Date().toLocaleString('zh-TW'),
            '狀態': '成功',
        });
        res.json({
            status: 'success',
            message: 'User deleted successfully',
            data: {
                userId,
                email: user.email,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Admin: Delete user failed', error, {
            userId: req.params.userId,
        });
        res.status(500).json({ error: error.message || 'Failed to delete user' });
    }
};
exports.deleteUser = deleteUser;
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
const updateUserTierAdmin = async (req, res) => {
    try {
        // 驗證管理員權杖 Token - 僅允許用帳戶密碼登入的管理員
        const tokenInfo = verifyAdminTokenWithPermission(req, 'email');
        if (!tokenInfo) {
            (0, logger_1.logDebug)('Unauthorized admin request: update user tier', {
                path: req.path,
                ip: req.ip,
            });
            res.status(403).json({ error: 'Only admin users can perform this action' });
            return;
        }
        const { userId } = req.params;
        const { tier } = req.body;
        if (!userId) {
            res.status(400).json({ error: 'userId is required in params' });
            return;
        }
        if (!tier) {
            res.status(400).json({ error: 'tier is required in body' });
            return;
        }
        // 驗證 tier 欄位值
        const validTiers = ['Basic', 'Pro', 'Ultimate', 'VIP'];
        if (!validTiers.includes(tier)) {
            res.status(400).json({ error: `Invalid tier. Must be one of: ${validTiers.join(', ')}` });
            return;
        }
        // 驗證用戶存在
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, tier: true },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        // 取得目前 tier
        const previousTier = user.tier || 'Basic';
        // 如果等級相同，則不做任何操作
        if (previousTier === tier) {
            res.json({
                status: 'success',
                message: 'User tier is already set to this value',
                data: {
                    userId,
                    tier,
                    userEmail: user.email,
                },
            });
            return;
        }
        // 更新用戶等級
        const result = await (0, apiRateLimitUtil_1.updateUserTier)(userId, tier, 'admin');
        (0, logger_1.logBusinessEvent)('admin_user_tier_updated', userId, {
            previousTier: result.previousTier,
            newTier: result.newTier,
            userEmail: user.email,
            updatedAt: new Date().toISOString(),
        });
        // 發送通知郵件
        await emailService_1.EmailService.sendAdminOperationEmail('修改用戶等級', {
            '用戶 ID': userId,
            '用戶郵箱': user.email,
            '原等級': result.previousTier,
            '新等級': result.newTier,
            '操作者': tokenInfo.adminEmail,
            'IP 地址': req.ip,
            '時間': new Date().toLocaleString('zh-TW'),
            '狀態': '成功',
        });
        res.json({
            status: 'success',
            message: 'User tier updated successfully',
            data: {
                userId,
                previousTier: result.previousTier,
                newTier: result.newTier,
                userEmail: user.email,
                updatedAt: new Date().toISOString(),
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Admin: Update user tier failed', error, {
            userId: req.params.userId,
            tier: req.body?.tier,
        });
        res.status(500).json({ error: error.message || 'Failed to update user tier' });
    }
};
exports.updateUserTierAdmin = updateUserTierAdmin;
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
const getUserTierAdmin = async (req, res) => {
    try {
        // 驗證管理員權杖 Token
        // 驗證管理員權杖 Token - 僅允許用帳戶密碼登入的管理員
        const tokenInfo = verifyAdminTokenWithPermission(req, 'email');
        if (!tokenInfo) {
            (0, logger_1.logDebug)('Unauthorized admin request: get user tier', {
                path: req.path,
                ip: req.ip,
            });
            res.status(403).json({ error: 'Only admin users can perform this action' });
            return;
        }
        const { userId } = req.params;
        if (!userId) {
            res.status(400).json({ error: 'userId is required in params' });
            return;
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, tier: true },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            status: 'success',
            data: {
                userId,
                tier: user.tier || 'Basic',
                email: user.email,
            },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Admin: Get user tier failed', error, {
            userId: req.params.userId,
        });
        res.status(500).json({ error: 'Failed to fetch user tier' });
    }
};
exports.getUserTierAdmin = getUserTierAdmin;
/**
 * ==========================================
 * 管理員帳戶管理端點（需 X-Admin-Secret 驗證）
 * ==========================================
 */
const createAdmin = async (req, res) => {
    try {
        // 驗證管理員權杖 Token - 僅允許用 Secret 登入的管理員
        const tokenInfo = verifyAdminTokenWithPermission(req, 'secret');
        if (!tokenInfo) {
            (0, logger_1.logDebug)('Unauthorized request: create admin', { path: req.path, ip: req.ip });
            res.status(403).json({ error: 'Only secret authentication can manage admin accounts' });
            return;
        }
        const { email, password, name, role = 'admin' } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'email and password are required' });
            return;
        }
        const existingAdmin = await prisma_1.prisma.admin.findUnique({ where: { email } });
        if (existingAdmin) {
            res.status(409).json({ error: 'Admin email already exists' });
            return;
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const newAdmin = await prisma_1.prisma.admin.create({
            data: { email, password: hashedPassword, name, role, isActive: true },
            select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        });
        (0, logger_1.logBusinessEvent)('admin_account_created', newAdmin.id, { email: newAdmin.email, role: newAdmin.role });
        // 發送通知郵件
        await emailService_1.EmailService.sendAdminOperationEmail('創建管理員帳戶', {
            '新管理員 ID': newAdmin.id,
            '新管理員郵箱': newAdmin.email,
            '新管理員名稱': newAdmin.name || 'N/A',
            '角色': newAdmin.role,
            '操作者': tokenInfo.adminEmail,
            'IP 地址': req.ip,
            '時間': new Date().toLocaleString('zh-TW'),
            '狀態': '成功',
        });
        res.status(201).json({
            status: 'success',
            message: 'Admin account created successfully',
            data: newAdmin,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Admin: Create admin failed', error);
        res.status(500).json({ error: error.message || 'Failed to create admin account' });
    }
};
exports.createAdmin = createAdmin;
const updateAdmin = async (req, res) => {
    try {
        // 驗證管理員權杖 Token - 僅允許用 Secret 登入的管理員
        const tokenInfo = verifyAdminTokenWithPermission(req, 'secret');
        if (!tokenInfo) {
            (0, logger_1.logDebug)('Unauthorized request: update admin', { path: req.path, ip: req.ip });
            res.status(403).json({ error: 'Only secret authentication can manage admin accounts' });
            return;
        }
        const { adminId } = req.params;
        const { password, name, isActive } = req.body;
        if (!adminId) {
            res.status(400).json({ error: 'adminId is required in params' });
            return;
        }
        const admin = await prisma_1.prisma.admin.findUnique({ where: { id: adminId } });
        if (!admin) {
            res.status(404).json({ error: 'Admin not found' });
            return;
        }
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (isActive !== undefined)
            updateData.isActive = isActive;
        if (password)
            updateData.password = await bcryptjs_1.default.hash(password, 10);
        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }
        const updatedAdmin = await prisma_1.prisma.admin.update({
            where: { id: adminId },
            data: updateData,
            select: { id: true, email: true, name: true, role: true, isActive: true, updatedAt: true },
        });
        (0, logger_1.logBusinessEvent)('admin_account_updated', adminId, { email: updatedAdmin.email, updatedFields: Object.keys(updateData) });
        // 發送通知郵件
        await emailService_1.EmailService.sendAdminOperationEmail('修改管理員帳戶', {
            '管理員 ID': adminId,
            '管理員郵箱': updatedAdmin.email,
            '管理員名稱': updatedAdmin.name || 'N/A',
            '更新欄位': Object.keys(updateData).join(', '),
            '是否啟用': updatedAdmin.isActive ? '是' : '否',
            '操作者': tokenInfo.adminEmail,
            'IP 地址': req.ip,
            '時間': new Date().toLocaleString('zh-TW'),
            '狀態': '成功',
        });
        res.json({
            status: 'success',
            message: 'Admin account updated successfully',
            data: updatedAdmin,
        });
    }
    catch (error) {
        (0, logger_1.logError)('Admin: Update admin failed', error, { adminId: req.params.adminId });
        res.status(500).json({ error: error.message || 'Failed to update admin account' });
    }
};
exports.updateAdmin = updateAdmin;
const deleteAdmin = async (req, res) => {
    try {
        // 驗證管理員權杖 Token - 僅允許用 Secret 登入的管理員
        const tokenInfo = verifyAdminTokenWithPermission(req, 'secret');
        if (!tokenInfo) {
            (0, logger_1.logDebug)('Unauthorized request: delete admin', { path: req.path, ip: req.ip });
            res.status(403).json({ error: 'Only secret authentication can manage admin accounts' });
            return;
        }
        const { adminId } = req.params;
        if (!adminId) {
            res.status(400).json({ error: 'adminId is required in params' });
            return;
        }
        const admin = await prisma_1.prisma.admin.findUnique({
            where: { id: adminId },
            select: { id: true, email: true },
        });
        if (!admin) {
            res.status(404).json({ error: 'Admin not found' });
            return;
        }
        await prisma_1.prisma.admin.delete({ where: { id: adminId } });
        (0, logger_1.logBusinessEvent)('admin_account_deleted', adminId, { email: admin.email });
        // 發送通知郵件
        await emailService_1.EmailService.sendAdminOperationEmail('刪除管理員帳戶', {
            '被刪除管理員 ID': admin.id,
            '被刪除管理員郵箱': admin.email,
            '操作者': tokenInfo.adminEmail,
            'IP 地址': req.ip,
            '時間': new Date().toLocaleString('zh-TW'),
            '狀態': '成功',
        });
        res.json({
            status: 'success',
            message: 'Admin account deleted successfully',
            data: { id: admin.id, email: admin.email },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Admin: Delete admin failed', error, { adminId: req.params.adminId });
        res.status(500).json({ error: error.message || 'Failed to delete admin account' });
    }
};
exports.deleteAdmin = deleteAdmin;
const listAdmins = async (req, res) => {
    try {
        // 驗證管理員權杖 Token - 僅允許用 Secret 登入的管理員
        const tokenInfo = verifyAdminTokenWithPermission(req, 'secret');
        if (!tokenInfo) {
            (0, logger_1.logDebug)('Unauthorized request: list admins', { path: req.path, ip: req.ip });
            res.status(403).json({ error: 'Only secret authentication can manage admin accounts' });
            return;
        }
        const admins = await prisma_1.prisma.admin.findMany({
            select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true },
            orderBy: { createdAt: 'desc' },
        });
        (0, logger_1.logBusinessEvent)('admin_list_viewed', 'admin', { totalAdmins: admins.length });
        res.json({
            status: 'success',
            data: { total: admins.length, admins },
        });
    }
    catch (error) {
        (0, logger_1.logError)('Admin: List admins failed', error);
        res.status(500).json({ error: error.message || 'Failed to fetch admins' });
    }
};
exports.listAdmins = listAdmins;
//# sourceMappingURL=adminController.js.map