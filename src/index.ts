import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initializeEnv } from './config/env';
import { getFeatureFlags, isFeatureEnabled } from './config/features';
import { initializeDatabase, closeDatabase } from './domains/shared/lib/database';
import { authRouter } from './domains/auth';
import { plaidRouter } from './domains/plaid';
import { assetRouter } from './domains/asset';
import { exchangeRouter } from './domains/exchange';
import { notificationRouter } from './domains/notification';
import { debankRouter } from './domains/debank';
import { stripeRouter } from './domains/stripe';
import { walletRouter } from './domains/wallet';
import { treasuryRouter } from './domains/treasury';
import { bridgeRouter } from './domains/bridge';
import { dinariRouter } from './domains/dinari';
import { waitlistRouter } from './domains/waitlist';
import { platformInsightsRouter } from './domains/platform-insights';
import { privyAnalyticsRouter } from './domains/privy-analytics';
import { lifiAnalyticsRouter } from './domains/lifi-analytics';
import { adminRouter } from './domains/admin';
import {
  appLogger,
  httpLogger,
  requestBodyLogger,
  errorLogger,
  logStartup,
  logDebug,
} from './domains/logger';
import { rateLimiter, authRateLimiter } from './domains/shared/middleware/rateLimiter';
import { webTierGate } from './domains/auth/middleware/requireWebTier';

// ========================================
// 1. Environment + database URL
// ========================================
initializeEnv();

const app = express();
const PORT = Number(process.env.PORT || 8080);

// ========================================
// 1.5 Trust proxy (real client IP behind Cloud Run / Nginx)
// ========================================
app.set('trust proxy', 1); // trust first hop

// Stripe webhook must receive the raw body for signature verification.
if (isFeatureEnabled('stripe')) {
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
}

// Bridge webhook: RSA signature over "{timestamp}.{rawBody}".
// Capture raw body (string) before JSON parsing for signature verification.
if (isFeatureEnabled('bridge')) {
  app.use('/api/bridge/webhook', (req: Request, _res: Response, next: NextFunction) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
      (req as Request & { rawBody?: string }).rawBody = raw;
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
      next();
    });
  });
}

// ========================================
// 2. CORS
// ========================================
const productionOrigins = [
  'https://app.kura-finance.com',
  'https://www.kura-finance.com',
  'https://kura-finance.com',
  'https://admin.kura-finance.com',
];
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

const corsOptions = {
  origin: (() => {
    const hardcoded =
      process.env.NODE_ENV === 'production' ? productionOrigins : developmentOrigins;
    // Optional extras from env (merged; hardcoded always wins as base).
    const fromEnv = (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return [...new Set([...hardcoded, ...fromEnv])];
  })(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Number'],
  maxAge: 86400, // 24h preflight cache
};

// ========================================
// 3. Middleware
// ========================================
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(requestBodyLogger);
app.use(httpLogger);

// Cookie debug middleware (development).
if (process.env.DEBUG_COOKIES === 'true') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const authCookie = req.cookies.authToken;
    logDebug('Cookie Debug Info', {
      path: req.path,
      hasAuthCookie: !!authCookie,
      cookieCount: Object.keys(req.cookies || {}).length,
      allCookies: Object.keys(req.cookies || {}),
      userAgent: req.get('User-Agent'),
    });
    next();
  });
}

// Looser rate limit for auth routes.
app.use('/api/auth', authRateLimiter);

// General API rate limit.
app.use('/api/', rateLimiter);

// Web soft gate: Basic may log in / pay; other Web APIs need Pro / Ultimate.
app.use('/api', webTierGate);

// ========================================
// 4. Well-known endpoints (Universal Links / Passkey / Associated Domains)
// ========================================

const DEFAULT_APPLE_APP_ID = 'K7FVP5GGP9.com.kurafinance.app';
const DEFAULT_ANDROID_PACKAGE_NAME = 'com.kurafinance.app';
const DEFAULT_ANDROID_SHA256_CERT_FINGERPRINTS = [
  '3E:2E:17:95:8B:7C:6C:88:D6:6F:0F:A4:30:48:F1:7B:3C:E0:4F:A0:C5:D7:9D:32:06:80:77:FE:49:78:66:33',
  '31:E3:CE:78:ED:6F:55:A6:2C:40:34:F2:61:F2:91:43:2D:BE:44:74:A0:67:17:02:0B:88:9F:72:19:AE:BB:A0',
  '2B:AE:23:03:BE:ED:C6:A2:87:18:B5:89:7A:59:C9:43:A7:BB:56:8F:B2:50:CB:9F:FF:81:12:36:CA:EB:8B:F3',
  'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
];

function appleAppId(): string {
  return process.env.APPLE_APP_ID?.trim() || DEFAULT_APPLE_APP_ID;
}

function androidPackageName(): string {
  return process.env.ANDROID_PACKAGE_NAME?.trim() || DEFAULT_ANDROID_PACKAGE_NAME;
}

function androidSha256CertFingerprints(): string[] {
  const fromEnv = process.env.ANDROID_SHA256_CERT_FINGERPRINTS?.split(',')
    .map((fp) => fp.trim())
    .filter(Boolean);
  return fromEnv?.length ? fromEnv : DEFAULT_ANDROID_SHA256_CERT_FINGERPRINTS;
}

// iOS: Apple App Site Association — required for Universal Links and Passkeys.
// Override with APPLE_APP_ID (format: TeamID.bundleId).
app.get('/.well-known/apple-app-site-association', (_req: Request, res: Response) => {
  const appID = appleAppId();
  res.setHeader('Content-Type', 'application/json');
  res.json({
    applinks: {
      apps: [],
      details: [
        {
          appID,
          paths: ['*'],
        },
      ],
    },
    webcredentials: {
      apps: [appID],
    },
  });
});

/**
 * WebAuthn Related Origin Requests — lets https://app.kura-finance.com use
 * RP ID api.kura-finance.com (same passkeys as the mobile app).
 * @see https://passkeys.dev/docs/advanced/related-origins/
 */
app.get('/.well-known/webauthn', (_req: Request, res: Response) => {
  const related =
    process.env.WEBAUTHN_RELATED_ORIGINS ||
    'https://app.kura-finance.com';
  const origins = related
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ origins });
});

// Android: Digital Asset Links — required for Android Passkeys.
// Override with ANDROID_PACKAGE_NAME and ANDROID_SHA256_CERT_FINGERPRINTS (comma-separated).
app.get('/.well-known/assetlinks.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
      target: {
        namespace: 'android_app',
        package_name: androidPackageName(),
        sha256_cert_fingerprints: androidSha256CertFingerprints(),
      },
    },
  ]);
});

// ========================================
// 4. Health + public feature flags
// ========================================
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    features: getFeatureFlags(),
  });
});

/** Public snapshot of domain feature flags (for clients / open-source forks). */
app.get('/api/features', (_req: Request, res: Response) => {
  res.status(200).json({ features: getFeatureFlags() });
});

// ========================================
// 5. API routes (optional domains gated by src/config/features.ts)
// ========================================
app.use('/api/auth', authRouter);
app.use('/api/assets', assetRouter);

if (isFeatureEnabled('plaid')) app.use('/api/plaid', plaidRouter);
if (isFeatureEnabled('exchange')) app.use('/api/exchange', exchangeRouter);
if (isFeatureEnabled('notifications')) app.use('/api/notifications', notificationRouter);
if (isFeatureEnabled('debank')) app.use('/api/debank', debankRouter);
if (isFeatureEnabled('stripe')) app.use('/api/stripe', stripeRouter);
if (isFeatureEnabled('wallet')) app.use('/api/wallet', walletRouter);
if (isFeatureEnabled('treasury')) app.use('/api/treasuries', treasuryRouter);
if (isFeatureEnabled('bridge')) app.use('/api/bridge', bridgeRouter);
if (isFeatureEnabled('dinari')) app.use('/api/dinari', dinariRouter);
if (isFeatureEnabled('waitlist')) app.use('/api/waitlist', waitlistRouter);
if (isFeatureEnabled('platformInsights')) app.use('/api/platform-insights', platformInsightsRouter);
if (isFeatureEnabled('privyAnalytics')) app.use('/api/privy-analytics', privyAnalyticsRouter);
if (isFeatureEnabled('lifiAnalytics')) app.use('/api/lifi-analytics', lifiAnalyticsRouter);
if (isFeatureEnabled('admin')) app.use('/api/admin', adminRouter);

// ========================================
// 6. Error middleware
// ========================================
app.use(errorLogger);
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const statusCode = res.statusCode || 500;
  appLogger.error('Unhandled error in request', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  res.status(statusCode).json({ error: 'Internal server error' });
});

// ========================================
// 7. Process-level error handlers
// ========================================
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  appLogger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled promise rejection:', reason);
  appLogger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// ========================================
// 8. Start server
// ========================================
async function startServer() {
  try {
    await initializeDatabase();

    const server = app.listen(PORT, '0.0.0.0', () => {
      logStartup('Kura Backend', '1.0.0', PORT, 'HTTP');
    });

    // Graceful shutdown on SIGTERM (e.g. Cloud Run).
    process.on('SIGTERM', async () => {
      console.log('💤 Received SIGTERM signal, shutting down...');
      server.close(async () => {
        await closeDatabase();
        console.log('✅ Server closed gracefully');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    await closeDatabase();
    process.exit(1);
  }
}

startServer();