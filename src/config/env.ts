import dotenv from 'dotenv';

/**
 * Environment configuration.
 * Centralizes loading and validation of process.env.
 */

// Default NODE_ENV to development when unset.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

const isProduction = process.env.NODE_ENV === 'production';

// Load .env file in non-production when DB_HOST is not already injected.
if (!isProduction && !process.env.DB_HOST) {
  const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
  console.log(`📝 Loading environment from ${envFile}`);
  dotenv.config({ path: envFile });
}

/**
 * Build DATABASE_URL for Prisma.
 * Uses Unix socket for Cloud SQL in production, TCP otherwise.
 */
export function buildDatabaseUrl(): string {
  const dbUser = process.env.DB_USER || 'postgres';
  const rawPassword = process.env.DB_PASSWORD || '';
  // Always encode so special characters in the password stay URL-safe.
  const dbPassword = encodeURIComponent(rawPassword);
  const dbName = process.env.DB_NAME || 'kura_db';
  const dbSchema = process.env.DB_SCHEMA || 'public';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';

  console.log(`📊 Database config: user=${dbUser}, host=${dbHost}, port=${dbPort}, db=${dbName}`);

  // Production Cloud SQL: connect via Unix socket (Cloud SQL Proxy).
  if (isProduction && dbHost.startsWith('/cloudsql/')) {
    console.log('🔌 Using Cloud SQL Proxy Unix Socket');
    // Prisma Unix-socket URLs must use hostname `localhost`; the real socket
    // path goes in the `?host=` query param:
    // postgresql://user:password@localhost/dbname?host=/path/to/socket&schema=public
    const url = `postgresql://${dbUser}:${dbPassword}@localhost/${dbName}?host=${dbHost}&schema=${dbSchema}`;
    console.log(`✅ Constructed Unix socket URL with localhost hostname override`);
    return url;
  }

  // Development / non–Cloud SQL: TCP.
  console.log(`🔌 Using TCP connection to ${dbHost}:${dbPort}`);
  return `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?schema=${dbSchema}`;
}

/** Validate required environment variables; exit on hard failures in production. */
export function validateEnvironment(): void {
  const required = ['JWT_SECRET', 'ENCRYPTION_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // ENCRYPTION_KEY must be 64 lowercase hex chars (32 bytes for AES-256).
  const encKey = process.env.ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-f]{64}$/.test(encKey)) {
    console.error('❌ ENCRYPTION_KEY must be exactly 64 lowercase hex characters (32 bytes)');
    console.error('💡 Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }

  // Resend (transactional email).
  const emailVars = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'];
  const missingEmailVars = emailVars.filter((key) => !process.env[key]);

  if (missingEmailVars.length > 0) {
    console.error(`❌ Resend API not fully configured: ${missingEmailVars.join(', ')}`);
    console.error('💡 Set RESEND_API_KEY and RESEND_FROM_EMAIL environment variables');
    if (isProduction) process.exit(1);
  }

  // Plaid.
  const plaidVars = ['PLAID_CLIENT_ID', 'PLAID_SANDBOX_SECRET', 'PLAID_PRODUCTION_SECRET'];
  const missingPlaidVars = plaidVars.filter((key) => !process.env[key]);

  if (missingPlaidVars.length > 0) {
    console.error(`❌ Plaid API not fully configured: ${missingPlaidVars.join(', ')}`);
    console.error('💡 Set PLAID_CLIENT_ID, PLAID_SANDBOX_SECRET, and PLAID_PRODUCTION_SECRET environment variables');
    if (isProduction) process.exit(1);
  }

  // Stripe.
  const stripeVars = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  const missingStripeVars = stripeVars.filter((key) => !process.env[key]);

  if (missingStripeVars.length > 0) {
    console.error(`❌ Stripe API not fully configured: ${missingStripeVars.join(', ')}`);
    console.error('💡 Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET environment variables');
    if (isProduction) process.exit(1);
  }

  // DeBank.
  const debankVars = ['DEBANK_ACCESS_KEY'];
  const missingDeBankVars = debankVars.filter((key) => !process.env[key]);

  if (missingDeBankVars.length > 0) {
    console.error(`❌ DeBank API not fully configured: ${missingDeBankVars.join(', ')}`);
    console.error('💡 Set DEBANK_ACCESS_KEY environment variable');
    if (isProduction) process.exit(1);
  }

  // Privy (core login). Warn only so the process can still boot.
  const privyVars = ['PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'PRIVY_VERIFICATION_KEY'];
  const missingPrivyVars = privyVars.filter((key) => !process.env[key]);

  if (missingPrivyVars.length > 0) {
    console.warn(`⚠️ Privy auth not fully configured: ${missingPrivyVars.join(', ')}`);
    console.warn('💡 Set PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_VERIFICATION_KEY (from the Privy Dashboard)');
  }

  // WebAuthn / Passkey (E2EE unlock). Warn only.
  const webauthnVars = ['WEBAUTHN_RP_ID', 'WEBAUTHN_RP_NAME', 'WEBAUTHN_ORIGIN'];
  const missingWebauthnVars = webauthnVars.filter((key) => !process.env[key]);

  if (missingWebauthnVars.length > 0) {
    console.warn(`⚠️ WebAuthn/Passkey not fully configured: ${missingWebauthnVars.join(', ')}`);
    console.warn('💡 Set WEBAUTHN_RP_ID (domain), WEBAUTHN_RP_NAME, WEBAUTHN_ORIGIN (comma-separated allowed origins)');
  }

  // Bridge on/off-ramp.
  const bridgeVars = ['BRIDGE_API_KEY'];
  const missingBridgeVars = bridgeVars.filter((key) => !process.env[key]);

  if (missingBridgeVars.length > 0) {
    console.error(`❌ Bridge API not fully configured: ${missingBridgeVars.join(', ')}`);
    console.error('💡 Set BRIDGE_API_KEY (from the Bridge Dashboard) to enable on/off ramp');
    if (isProduction) process.exit(1);
  }

  // Webhook public key is optional; without it the webhook endpoint fail-closes.
  if (!process.env.BRIDGE_WEBHOOK_PUBLIC_KEY) {
    console.warn('⚠️ BRIDGE_WEBHOOK_PUBLIC_KEY not set — Bridge webhooks will be rejected until configured');
  }

  // Dinari tokenized stocks.
  const dinariVars = ['DINARI_API_KEY_ID', 'DINARI_API_SECRET_KEY'];
  const missingDinariVars = dinariVars.filter((key) => !process.env[key]);

  if (missingDinariVars.length > 0) {
    console.error(`❌ Dinari API not fully configured: ${missingDinariVars.join(', ')}`);
    console.error('💡 Set DINARI_API_KEY_ID / DINARI_API_SECRET_KEY (from partners.dinari.com) to enable tokenized stocks');
    if (isProduction) process.exit(1);
  }

  // Payment token (e.g. USDC) required for orders.
  if (!process.env.DINARI_PAYMENT_TOKEN_ADDRESS) {
    console.warn('⚠️ DINARI_PAYMENT_TOKEN_ADDRESS not set — Dinari order placement will be rejected until configured');
  }
  if (!process.env.DINARI_WHITELIST_EMAILS && !process.env.DINARI_WHITELIST_DOMAINS) {
    console.warn(
      '⚠️ DINARI_WHITELIST_EMAILS / DINARI_WHITELIST_DOMAINS not set — only DEMO_USER_EMAILS can access Dinari Entity/KYC',
    );
  }

  // LI.FI Investor analytics; sync rejects until integrator is set.
  // Comma-separated: LIFI_INTEGRATOR=kura-ios,kura-android,kura-web
  if (!process.env.LIFI_INTEGRATOR) {
    console.warn(
      '⚠️ LIFI_INTEGRATOR not set — LI.FI transfer sync for Investor will be unavailable until configured',
    );
  }

  // Production DB config check.
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

/** Initialize env: build DATABASE_URL, then validate required vars. */
export function initializeEnv(): void {
  // Cloud Run diagnostics: surface missing DB_* early.
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

  const url = buildDatabaseUrl();
  if (!url) {
    console.error('❌ Failed to build DATABASE_URL');
    process.exit(1);
  }
  process.env.DATABASE_URL = url;
  console.log('✅ DATABASE_URL configured');

  validateEnvironment();

  console.log(`✅ Environment initialized (NODE_ENV=${process.env.NODE_ENV})`);
}
