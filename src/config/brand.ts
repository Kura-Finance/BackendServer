/**
 * Product display strings + URL helpers.
 * Branding is code/constants — not env / GitHub Secrets.
 * Public web origin is derived from ALLOWED_ORIGINS or WebAuthn origins.
 */

const PRODUCT_NAME = 'Kura';

export function getAppName(): string {
  return PRODUCT_NAME;
}

/**
 * Primary web app origin for upgrade links, demo KYC, logo fallbacks.
 * Derived from ALLOWED_ORIGINS (first entry), else WEBAUTHN_RELATED_ORIGINS / WEBAUTHN_ORIGIN.
 */
export function getAppUrl(): string {
  const fromAllowed = firstHttpOrigin(process.env.ALLOWED_ORIGINS);
  if (fromAllowed) return fromAllowed;

  const fromRelated = firstHttpOrigin(process.env.WEBAUTHN_RELATED_ORIGINS);
  if (fromRelated) return fromRelated;

  const fromOrigin = firstHttpOrigin(process.env.WEBAUTHN_ORIGIN);
  if (fromOrigin) return fromOrigin;

  return 'http://localhost:3000';
}

export function getUpgradeUrl(): string {
  return `${getAppUrl()}/pricing`;
}

export function getBrandDomain(): string {
  try {
    return new URL(getAppUrl()).hostname.replace(/^www\./i, '') || 'localhost';
  } catch {
    return 'localhost';
  }
}

export function getDemoBaseUrl(): string {
  return getAppUrl();
}

/** Ops allowlist / fraud mail — ADMIN_EMAIL or first ADMIN_EMAILS entry. */
export function getAdminEmail(): string {
  const single = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (single) return single;
  const first = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .find(Boolean);
  return first || '';
}

/** Outbound support From-contact; same as admin when unset. */
export function getSupportEmail(): string {
  return getAdminEmail() || 'support@localhost';
}

function firstHttpOrigin(csv: string | undefined): string | undefined {
  if (!csv) return undefined;
  for (const part of csv.split(',')) {
    const o = part.trim().replace(/\/+$/, '');
    if (!o || o.startsWith('android:')) continue;
    if (o.startsWith('http://') || o.startsWith('https://')) return o;
  }
  return undefined;
}
