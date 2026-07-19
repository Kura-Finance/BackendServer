import { prisma } from '../../shared/lib/prisma';
import { DemoService } from '../../demo/demoService';

function parseEnvList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function dinariWhitelistEmails(): Set<string> {
  return new Set(parseEnvList(process.env.DINARI_WHITELIST_EMAILS).filter((entry) => !entry.startsWith('@')));
}

/**
 * Allowed email domains (no leading @).
 * Sources: `DINARI_WHITELIST_DOMAINS` (comma-separated) and `@domain` entries in `DINARI_WHITELIST_EMAILS`.
 */
function dinariWhitelistDomains(): Set<string> {
  const fromDomainsEnv = parseEnvList(process.env.DINARI_WHITELIST_DOMAINS).map((d) =>
    d.startsWith('@') ? d.slice(1) : d,
  );
  const fromEmailsEnv = parseEnvList(process.env.DINARI_WHITELIST_EMAILS)
    .filter((entry) => entry.startsWith('@'))
    .map((entry) => entry.slice(1));
  return new Set([...fromDomainsEnv, ...fromEmailsEnv]);
}

function emailMatchesWhitelistDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return dinariWhitelistDomains().has(domain);
}

/** Dinari Entity / KYC 白名單：demo 測試帳 + DINARI_WHITELIST_EMAILS + 允許網域。 */
export async function isDinariWhitelistedUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const email = user?.email ?? null;
  if (DemoService.isDemoEmail(email)) return true;
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  if (dinariWhitelistEmails().has(normalized)) return true;
  if (emailMatchesWhitelistDomain(normalized)) return true;
  return false;
}
