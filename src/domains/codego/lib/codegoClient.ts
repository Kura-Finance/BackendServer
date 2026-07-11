/**
 * HTTP client for Codego VCC API + KYC session API.
 * @see https://developers.codegotech.com/visa-crypto-card.html
 */

const DEFAULT_VCC_API = 'https://vcc-sandbox.codegotech.com/api/v1';
const DEFAULT_KYC_API = 'https://kyc-sandbox.codegotech.com/api';

export class CodegoError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
    public readonly path: string,
  ) {
    super(`Codego API error ${statusCode} on ${path}: ${responseBody}`);
    this.name = 'CodegoError';
  }

  get parsedBody(): { error?: string; message?: string } | null {
    try {
      return JSON.parse(this.responseBody) as { error?: string; message?: string };
    } catch {
      return null;
    }
  }
}

function vccApiBase(): string {
  return (process.env.CODEGO_API_URL || DEFAULT_VCC_API).replace(/\/+$/, '');
}

function kycApiBase(): string {
  return (process.env.CODEGO_KYC_API_URL || DEFAULT_KYC_API).replace(/\/+$/, '');
}

function getVccApiKey(): string {
  const key = process.env.CODEGO_API_KEY;
  if (!key) {
    throw new CodegoError(500, 'CODEGO_API_KEY is not configured', 'config');
  }
  return key;
}

function getKycApiKey(): string {
  return process.env.CODEGO_KYC_API_KEY || getVccApiKey();
}

async function parseResponse<T>(res: globalThis.Response): Promise<T> {
  if (res.status === 204) return undefined as unknown as T;
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

/** Card issuing API (X-Api-Key) */
export async function codegoVccFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    'X-Api-Key': getVccApiKey(),
    Accept: 'application/json',
    ...options.headers,
  };

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const url = `${vccApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new CodegoError(res.status, await res.text(), path);
  }
  return parseResponse<T>(res);
}

/** KYC iframe session API (X-API-Key) */
export async function codegoKycFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    'X-API-Key': getKycApiKey(),
    Accept: 'application/json',
    ...options.headers,
  };

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const url = `${kycApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new CodegoError(res.status, await res.text(), path);
  }
  return parseResponse<T>(res);
}
