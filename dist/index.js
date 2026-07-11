"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const env_1 = require("./config/env");
const database_1 = require("./domains/shared/lib/database");
const auth_1 = require("./domains/auth");
const plaid_1 = require("./domains/plaid");
const asset_1 = require("./domains/asset");
const exchange_1 = require("./domains/exchange");
const notification_1 = require("./domains/notification");
const debank_1 = require("./domains/debank");
const stripe_1 = require("./domains/stripe");
const card_1 = require("./domains/card");
const wallet_1 = require("./domains/wallet");
const bridge_1 = require("./domains/bridge");
const codego_1 = require("./domains/codego");
const dinari_1 = require("./domains/dinari");
const waitlist_1 = require("./domains/waitlist");
const logger_1 = require("./domains/logger");
const rateLimiter_1 = require("./domains/shared/middleware/rateLimiter");
const requireWebTier_1 = require("./domains/auth/middleware/requireWebTier");
// ========================================
// 1. 初始化環境變數和數據庫 URL
// ========================================
(0, env_1.initializeEnv)();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 8080);
// ========================================
// 1.5 信任代理設置 (用於獲取真實客戶端 IP)
// ========================================
app.set('trust proxy', 1); // 信任第一層代理 (適用於 Cloud Run、Nginx 等)
// Stripe webhook 必須使用原始請求內容做簽章驗證
app.use('/api/stripe/webhook', express_1.default.raw({ type: 'application/json' }));
// Gnosis Pay webhook: Ed25519 signature over "{timestamp}.{rawBody}"
// Capture raw body before JSON parsing.
app.use('/api/card/webhooks/gp', (req, _res, next) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
        req.rawBody = raw;
        try {
            req.body = raw ? JSON.parse(raw) : {};
        }
        catch {
            req.body = {};
        }
        next();
    });
});
// Codego webhook: HMAC-SHA256 over raw body (Signature: sha256=...)
app.use('/api/codego/webhook', (req, _res, next) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
        req.rawBody = raw;
        try {
            req.body = raw ? JSON.parse(raw) : {};
        }
        catch {
            req.body = {};
        }
        next();
    });
});
// Bridge webhook: RSA signature over "{timestamp}.{rawBody}".
// Capture raw body (string) before JSON parsing for signature verification.
app.use('/api/bridge/webhook', (req, _res, next) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
        req.rawBody = raw;
        try {
            req.body = raw ? JSON.parse(raw) : {};
        }
        catch {
            req.body = {};
        }
        next();
    });
});
// ========================================
// 2. 設置 CORS
// ========================================
const developmentOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'https://localhost:3000',
    'https://127.0.0.1:3000',
    'https://localhost:3001',
    'https://127.0.0.1:3001',
];
const fallbackOrigins = process.env.NODE_ENV === 'production'
    ? [] // 生產環境必須通過環境變數設定
    : developmentOrigins;
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || fallbackOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Number'],
    maxAge: 86400, // 24 小時的預檢快取
};
// ========================================
// 3. 中間件
// ========================================
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
app.use((0, cookie_parser_1.default)());
app.use(logger_1.requestBodyLogger);
app.use(logger_1.httpLogger);
// Cookie 調試中間件（開發環境）
if (process.env.DEBUG_COOKIES === 'true') {
    app.use((req, res, next) => {
        const authCookie = req.cookies.authToken;
        (0, logger_1.logDebug)('Cookie Debug Info', {
            path: req.path,
            hasAuthCookie: !!authCookie,
            cookieCount: Object.keys(req.cookies || {}).length,
            allCookies: Object.keys(req.cookies || {}),
            userAgent: req.get('User-Agent'),
        });
        next();
    });
}
// 為認證路由應用寬鬆的速率限制
app.use('/api/auth', rateLimiter_1.authRateLimiter);
// 為其他 API 應用一般的速率限制
app.use('/api/', rateLimiter_1.rateLimiter); // 速率限制中間件 - 防止 API 被攻擊
// Web soft gate：Basic 用戶可登入／付費，其餘 Web API 需 Pro / Ultimate
app.use('/api', requireWebTier_1.webTierGate);
// ========================================
// 4. Well-known endpoints (Universal Links / Passkey / Associated Domains)
// ========================================
// iOS: Apple App Site Association
// Served at https://api.kura-finance.com/.well-known/apple-app-site-association
// Required for Universal Links AND Passkeys (WebAuthn) on iOS.
// Team ID: K7FVP5GGP9  |  Bundle ID: com.kurafinance.app
app.get('/.well-known/apple-app-site-association', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json({
        applinks: {
            apps: [],
            details: [
                {
                    appID: 'K7FVP5GGP9.com.kurafinance.app',
                    paths: ['*'],
                },
            ],
        },
        webcredentials: {
            apps: ['K7FVP5GGP9.com.kurafinance.app'],
        },
    });
});
// Android: Digital Asset Links
// Served at https://api.kura-finance.com/.well-known/assetlinks.json
// Required for Android Passkeys (WebAuthn).
app.get('/.well-known/assetlinks.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json([
        {
            relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
            target: {
                namespace: 'android_app',
                package_name: 'com.kurafinance.app',
                sha256_cert_fingerprints: [
                    '3E:2E:17:95:8B:7C:6C:88:D6:6F:0F:A4:30:48:F1:7B:3C:E0:4F:A0:C5:D7:9D:32:06:80:77:FE:49:78:66:33',
                    '31:E3:CE:78:ED:6F:55:A6:2C:40:34:F2:61:F2:91:43:2D:BE:44:74:A0:67:17:02:0B:88:9F:72:19:AE:BB:A0',
                    '2B:AE:23:03:BE:ED:C6:A2:87:18:B5:89:7A:59:C9:43:A7:BB:56:8F:B2:50:CB:9F:FF:81:12:36:CA:EB:8B:F3',
                    'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
                ],
            },
        },
    ]);
});
// ========================================
// 4. Health Check 端點
// ========================================
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
    });
});
// ========================================
// 5. API 路由
// ========================================
app.use('/api/auth', auth_1.authRouter);
app.use('/api/plaid', plaid_1.plaidRouter);
app.use('/api/assets', asset_1.assetRouter);
app.use('/api/exchange', exchange_1.exchangeRouter);
app.use('/api/notifications', notification_1.notificationRouter);
app.use('/api/debank', debank_1.debankRouter);
app.use('/api/stripe', stripe_1.stripeRouter);
app.use('/api/card', card_1.cardRouter);
app.use('/api/wallet', wallet_1.walletRouter);
app.use('/api/bridge', bridge_1.bridgeRouter);
app.use('/api/codego', codego_1.codegoRouter);
app.use('/api/dinari', dinari_1.dinariRouter);
app.use('/api/waitlist', waitlist_1.waitlistRouter);
// ========================================
// 6. 錯誤處理中間件
// ========================================
app.use(logger_1.errorLogger);
app.use((err, req, res, next) => {
    const statusCode = res.statusCode || 500;
    logger_1.appLogger.error('Unhandled error in request', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });
    res.status(statusCode).json({ error: 'Internal server error' });
});
// ========================================
// 7. 全局錯誤處理
// ========================================
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    logger_1.appLogger.error('Uncaught exception', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled promise rejection:', reason);
    logger_1.appLogger.error('Unhandled rejection', { reason, promise });
    process.exit(1);
});
// ========================================
// 8. 啟動服務器
// ========================================
async function startServer() {
    try {
        // 初始化數據庫連接
        await (0, database_1.initializeDatabase)();
        // 啟動 Express 服務器
        const server = app.listen(PORT, '0.0.0.0', () => {
            (0, logger_1.logStartup)('Kura Backend', '1.0.0', PORT, 'HTTP');
        });
        // 優雅關閉
        process.on('SIGTERM', async () => {
            console.log('💤 Received SIGTERM signal, shutting down...');
            server.close(async () => {
                await (0, database_1.closeDatabase)();
                console.log('✅ Server closed gracefully');
                process.exit(0);
            });
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        await (0, database_1.closeDatabase)();
        process.exit(1);
    }
}
startServer();
//# sourceMappingURL=index.js.map