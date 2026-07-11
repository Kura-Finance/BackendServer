import { prisma } from '../../shared/lib/prisma';
import { DemoService } from '../../demo/demoService';

function dinariWhitelistEmails(): Set<string> {
  return new Set(
    (process.env.DINARI_WHITELIST_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Dinari Entity / KYC 白名單：demo 測試帳 + DINARI_WHITELIST_EMAILS。 */
export async function isDinariWhitelistedUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const email = user?.email ?? null;
  if (DemoService.isDemoEmail(email)) return true;
  if (email && dinariWhitelistEmails().has(email.trim().toLowerCase())) return true;
  return false;
}
