import dotenv from 'dotenv';

/**
 * 環境變數配置
 * 集中管理環境變數加載和驗證
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
  dotenv.config({ path: envFile });
}

/**
 * 構建 DATABASE_URL
 * 自動判斷 TCP（開發）或 Unix Socket（生產）
 */
export function buildDatabaseUrl(): string {
  const dbUser = process.env.DB_USER || 'postgres';
  const rawPassword = process.env.DB_PASSWORD || '';
  // 只在密碼含特殊字元時進行 URL 編碼
  const dbPassword = encodeURIComponent(rawPassword);
  const dbName = process.env.DB_NAME || 'kura_db';
  const dbSchema = process.env.DB_SCHEMA || 'public';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';

  console.log(`📊 Database config: user=${dbUser}, host=${dbHost}, port=${dbPort}, db=${dbName}`);

  // 生產環境：使用 Unix Socket（Cloud SQL Proxy）
  if (isProduction && dbHost.startsWith('/cloudsql/')) {
    console.log('🔌 Using Cloud SQL Proxy Unix Socket');
    // 使用 Prisma 連線 Unix socket 時，hostname 必須指定為 localhost
    // 實際 socket 路徑放在 ?host 參數中
    // 格式：postgresql://user:password@localhost/dbname?host=/path/to/socket&schema=public
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
export function validateEnvironment(): void {
  const required = ['JWT_SECRET', 'ENCRYPTION_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // 驗證 ENCRYPTION_KEY 格式：必須是 64 hex 字元（32 bytes，用於 AES-256）
  const encKey = process.env.ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-f]{64}$/.test(encKey)) {
    console.error('❌ ENCRYPTION_KEY must be exactly 64 lowercase hex characters (32 bytes)');
    console.error('💡 Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }

  // 驗證 Resend API 配置（後端驗證郵件，需要完整配置）
  const emailVars = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'];
  const missingEmailVars = emailVars.filter((key) => !process.env[key]);
  
  if (missingEmailVars.length > 0) {
    console.error(`❌ Resend API not fully configured: ${missingEmailVars.join(', ')}`);
    console.error('💡 Set RESEND_API_KEY and RESEND_FROM_EMAIL environment variables');
    if (isProduction) process.exit(1);
  }

  // 驗證 Plaid API 配置
  const plaidVars = ['PLAID_CLIENT_ID', 'PLAID_SANDBOX_SECRET', 'PLAID_PRODUCTION_SECRET'];
  const missingPlaidVars = plaidVars.filter((key) => !process.env[key]);
  
  if (missingPlaidVars.length > 0) {
    console.error(`❌ Plaid API not fully configured: ${missingPlaidVars.join(', ')}`);
    console.error('💡 Set PLAID_CLIENT_ID, PLAID_SANDBOX_SECRET, and PLAID_PRODUCTION_SECRET environment variables');
    if (isProduction) process.exit(1);
  }

  // 驗證 Stripe API 配置
  const stripeVars = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  const missingStripeVars = stripeVars.filter((key) => !process.env[key]);

  if (missingStripeVars.length > 0) {
    console.error(`❌ Stripe API not fully configured: ${missingStripeVars.join(', ')}`);
    console.error('💡 Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET environment variables');
    if (isProduction) process.exit(1);
  }

  // 驗證 DeBank API 配置
  const debankVars = ['DEBANK_ACCESS_KEY'];
  const missingDeBankVars = debankVars.filter((key) => !process.env[key]);

  if (missingDeBankVars.length > 0) {
    console.error(`❌ DeBank API not fully configured: ${missingDeBankVars.join(', ')}`);
    console.error('💡 Set DEBANK_ACCESS_KEY environment variable');
    if (isProduction) process.exit(1);
  }

  // 驗證 Privy 認證配置（登入系統核心）
  const privyVars = ['PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'PRIVY_VERIFICATION_KEY'];
  const missingPrivyVars = privyVars.filter((key) => !process.env[key]);

  if (missingPrivyVars.length > 0) {
    console.warn(`⚠️ Privy auth not fully configured: ${missingPrivyVars.join(', ')}`);
    console.warn('💡 Set PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_VERIFICATION_KEY (from the Privy Dashboard)');
    // Login will fail until configured, but the server should still boot.
  }

  // 驗證 WebAuthn / Passkey 配置（E2EE 資料層解鎖）
  const webauthnVars = ['WEBAUTHN_RP_ID', 'WEBAUTHN_RP_NAME', 'WEBAUTHN_ORIGIN'];
  const missingWebauthnVars = webauthnVars.filter((key) => !process.env[key]);

  if (missingWebauthnVars.length > 0) {
    console.warn(`⚠️ WebAuthn/Passkey not fully configured: ${missingWebauthnVars.join(', ')}`);
    console.warn('💡 Set WEBAUTHN_RP_ID (domain), WEBAUTHN_RP_NAME, WEBAUTHN_ORIGIN (comma-separated allowed origins)');
    // Passkey endpoints will fail until configured, but the server should still boot.
  }

  // Gnosis Pay 為 permissionless（無 API key），PARTNER_ID 僅用於 webhook 訂閱，可選
  if (!process.env.GNOSIS_PAY_PARTNER_ID) {
    console.warn('⚠️ GNOSIS_PAY_PARTNER_ID not set — running in permissionless mode (webhooks unavailable)');
  }

  // 驗證 Bridge API 配置（on/off ramp）
  const bridgeVars = ['BRIDGE_API_KEY'];
  const missingBridgeVars = bridgeVars.filter((key) => !process.env[key]);

  if (missingBridgeVars.length > 0) {
    console.error(`❌ Bridge API not fully configured: ${missingBridgeVars.join(', ')}`);
    console.error('💡 Set BRIDGE_API_KEY (from the Bridge Dashboard) to enable on/off ramp');
    if (isProduction) process.exit(1);
  }

  // Webhook 簽章公鑰為可選：未設定時 webhook 端點會拒絕所有事件（fail-closed）
  if (!process.env.BRIDGE_WEBHOOK_PUBLIC_KEY) {
    console.warn('⚠️ BRIDGE_WEBHOOK_PUBLIC_KEY not set — Bridge webhooks will be rejected until configured');
  }

  // 驗證 Dinari API 配置（tokenized stocks / dShares）
  const dinariVars = ['DINARI_API_KEY_ID', 'DINARI_API_SECRET_KEY'];
  const missingDinariVars = dinariVars.filter((key) => !process.env[key]);

  if (missingDinariVars.length > 0) {
    console.error(`❌ Dinari API not fully configured: ${missingDinariVars.join(', ')}`);
    console.error('💡 Set DINARI_API_KEY_ID / DINARI_API_SECRET_KEY (from partners.dinari.com) to enable tokenized stocks');
    if (isProduction) process.exit(1);
  }

  // 下單需要支付代幣地址（USDC）；未設定時下單會被拒
  if (!process.env.DINARI_PAYMENT_TOKEN_ADDRESS) {
    console.warn('⚠️ DINARI_PAYMENT_TOKEN_ADDRESS not set — Dinari order placement will be rejected until configured');
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
 * Single source of truth for reading `JWT_SECRET`.
 *
 * Returns the env value or throws if it is not configured. We must never fall
 * back to a literal default like `'secret'` — `validateEnvironment()` runs at
 * boot and exits the process if the var is missing, so any caller of this
 * helper after startup is guaranteed to get a real secret. The throw is a
 * defence-in-depth guard for code paths that bypass `initializeEnv()` (tests,
 * scripts, ad-hoc imports).
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured. Did initializeEnv() run?');
  }
  return secret;
}

/**
 * 初始化環境配置
 */
export function initializeEnv(): void {
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
