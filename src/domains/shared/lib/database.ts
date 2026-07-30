import { PrismaClient } from '@prisma/client';
import { logDebug, logDatabaseOperation, logError } from '../../logger';

/**
 * Singleton Prisma client.
 * DATABASE_URL must be set before this module loads (via initializeEnv).
 */
export const prisma = new PrismaClient();

/**
 * Initialize the database connection.
 * - Migrations run in CI/CD (`prisma migrate deploy`), not here
 * - Smoke-test connectivity and log status
 */
export async function initializeDatabase(): Promise<void> {
  try {
    logDebug('Initializing database connection...');

    const startTime = Date.now();

    // Connect and verify availability
    await prisma.$connect();
    await prisma.$executeRaw`SELECT 1`;

    const duration = Date.now() - startTime;

    logDatabaseOperation('Connection Test', 'system', duration, true);

    console.log('✅ Database connection successful');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError('Database initialization failed', error, {
      message: errorMessage,
    });
    console.error('❌ Database initialization failed:', errorMessage);
    throw error;
  }
}

/** Gracefully disconnect Prisma. */
export async function closeDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('📴 Database connection closed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error closing database connection:', errorMessage);
    logError('Database disconnect error', error);
  }
}

/** Process signals → graceful DB shutdown. */
process.on('SIGTERM', async () => {
  console.log('💤 Received SIGTERM signal, closing database...');
  await closeDatabase();
});

process.on('SIGINT', async () => {
  console.log('💤 Received SIGINT signal, closing database...');
  await closeDatabase();
});
