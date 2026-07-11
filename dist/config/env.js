"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDatabaseUrl = buildDatabaseUrl;
exports.validateEnvironment = validateEnvironment;
exports.initializeEnv = initializeEnv;
const dotenv_1 = __importDefault(require("dotenv"));
/**
 * 環境變數配置
 * 參考 saori 的做法，集中管理環境變數加載和驗證
 */
// 如果 NODE_ENV 未設置，預設為 development
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
}
const isProduction = process.env.NODE_ENV === 'production';
// 加載 .env 文件（開發環境）
if (!isProduction && !process.env.DB_HOST) {
    const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
    console.log(`📝 Loading environment from ${envFile}`);
    dotenv_1.default.config({ path: envFile });
}
/**
 * 構建 DATABASE_URL
 * 自動判斷 TCP（開發）或 Unix Socket（生產）
 */
function buildDatabaseUrl() {
    const dbUser = process.env.DB_USER || 'postgres';
    const rawPassword = process.env.DB_PASSWORD || '';
    // URL encode password only for special characters
    const dbPassword = encodeURIComponent(rawPassword);
    const dbName = process.env.DB_NAME || 'kura_db';
    const dbSchema = process.env.DB_SCHEMA || 'public';
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    console.log(`📊 Database config: user=${dbUser}, host=${dbHost}, port=${dbPort}, db=${dbName}`);
    // 生產環境：使用 Unix Socket（Cloud SQL Proxy）
    if (isProduction && dbHost.startsWith('/cloudsql/')) {
        console.log('🔌 Using Cloud SQL Proxy Unix Socket');
        // For Unix sockets with Prisma: hostname must be specified (localhost)
        // The actual socket path goes in the ?host parameter
        // Format: postgresql://user:password@localhost/dbname?host=/path/to/socket&schema=public
        const url = `postgresql://${dbUser}:${dbPassword}@localhost/${dbName}?host=${dbHost}&schema=${dbSchema}`;
        console.log(`✅ Constructed Unix socket URL with localhost hostname override`);
        return url;
    }
    // 開發環境或非 Cloud SQL：使用 TCP 連接
    console.log(`🔌 Using TCP connection to ${dbHost}:${dbPort}`);
    return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?schema=${dbSchema}`;
}
/**
 * 驗證必填環境變數
 */
function validateEnvironment() {
    const required = ['JWT_SECRET'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
    // 驗證 Resend API 配置（後端驗證郵件，需要完整配置）
    const emailVars = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'];
    const missingEmailVars = emailVars.filter((key) => !process.env[key]);
    if (missingEmailVars.length > 0) {
        console.error(`❌ Resend API not fully configured: ${missingEmailVars.join(', ')}`);
        console.error('💡 Set RESEND_API_KEY and RESEND_FROM_EMAIL environment variables');
        if (isProduction)
            process.exit(1);
    }
    // 驗證 Plaid API 配置
    const plaidVars = ['PLAID_CLIENT_ID', 'PLAID_SANDBOX_SECRET', 'PLAID_PRODUCTION_SECRET'];
    const missingPlaidVars = plaidVars.filter((key) => !process.env[key]);
    if (missingPlaidVars.length > 0) {
        console.error(`❌ Plaid API not fully configured: ${missingPlaidVars.join(', ')}`);
        console.error('💡 Set PLAID_CLIENT_ID, PLAID_SANDBOX_SECRET, and PLAID_PRODUCTION_SECRET environment variables');
        if (isProduction)
            process.exit(1);
    }
    // 在生產環境檢查數據庫配置
    if (isProduction) {
        const dbVars = {
            'DB_USER': process.env.DB_USER,
            'DB_PASSWORD': process.env.DB_PASSWORD,
            'DB_NAME': process.env.DB_NAME,
            'DB_HOST': process.env.DB_HOST,
            'DATABASE_URL': process.env.DATABASE_URL,
        };
        const emptyVars = Object.entries(dbVars)
            .filter(([, value]) => !value)
            .map(([key]) => key);
        if (emptyVars.length > 0) {
            console.error(`❌ Production environment missing database configuration: ${emptyVars.join(', ')}`);
            console.error(`📋 DATABASE_URL: ${process.env.DATABASE_URL || 'NOT SET'}`);
            process.exit(1);
        }
    }
}
/**
 * 初始化環境配置
 */
function initializeEnv() {
    // 先檢查環境變數是否存在（Cloud Run 診斷）
    if (isProduction) {
        const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
        const missing = requiredVars.filter((key) => !process.env[key]);
        if (missing.length > 0) {
            console.warn(`⚠️ Missing database environment variables: ${missing.join(', ')}`);
            console.warn(`📋 Available vars: ${Object.keys(process.env)
                .filter(k => k.startsWith('DB_') || k.includes('NODE_ENV'))
                .sort()
                .join(', ')}`);
        }
    }
    // 設置 DATABASE_URL
    const url = buildDatabaseUrl();
    if (!url) {
        console.error('❌ Failed to build DATABASE_URL');
        process.exit(1);
    }
    process.env.DATABASE_URL = url;
    console.log('✅ DATABASE_URL configured');
    // 驗證必填變數
    validateEnvironment();
    console.log(`✅ Environment initialized (NODE_ENV=${process.env.NODE_ENV})`);
}
//# sourceMappingURL=env.js.map