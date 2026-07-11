import { prisma } from '../../shared/lib/prisma';
import { DemoService } from '../../demo/demoService';

/** 內建允許的 email 網域（不含 @）。 */
const DINARI_WHITELIST_DOMAINS_BUILTIN = ['theprism.ltd'] as const;

function parseEnvList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function dinariWhitelistEmails(): Set<string> {
  return new Set(parseEnvList(process.env.DINARI_WHITELIST_EMAILS).filter((entry) => !entry.startsWith('@')));
}

function dinariWhitelistDomains(): Set<string> {
  const fromEnv = parseEnvList(process.env.DINARI_WHITELIST_EMAILS)
    .filter((entry) => entry.startsWith('@'))
    .map((entry) => entry.slice(1));
  return new Set([...DINARI_WHITELIST_DOMAINS_BUILTIN, ...fromEnv]);
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
