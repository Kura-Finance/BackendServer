/**
 * Bridge HTTP client + error types.
 */

import * as crypto from 'crypto';

const DEFAULT_BRIDGE_API = 'https://api.bridge.xyz/v0';

function bridgeApiBase(): string {
  return (process.env.BRIDGE_API_URL || DEFAULT_BRIDGE_API).replace(/\/+$/, '');
}

function getApiKey(): string {
  const key = process.env.BRIDGE_API_KEY;
  if (!key) {
    throw new BridgeError(500, 'BRIDGE_API_KEY is not configured', 'config');
  }
  return key;
}

export interface BridgeStructuredErrorBody {
  code?: string;
  endorsement?: string;
  currency?: string;
  message?: string;
}

export class BridgeError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly bridgeBody: string,
    public readonly path: string,
  ) {
    super(`Bridge API error ${statusCode} on ${path}: ${bridgeBody}`);
    this.name = 'BridgeError';
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get structuredBody(): BridgeStructuredErrorBody | null {
    try {
      return JSON.parse(this.bridgeBody) as BridgeStructuredErrorBody;
    } catch {
      return null;
    }
  }
}

async function parseBridgeResponse<T>(res: globalThis.Response): Promise<T> {
  if (res.status === 204) return undefined as unknown as T;
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

interface BridgeFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
}

export async function bridgeFetch<T>(path: string, options: BridgeFetchOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    'Api-Key': getApiKey(),
    Accept: 'application/json',
  };

  // Idempotency-Key is POST-only (GET/PUT/PATCH/DELETE must not send it)
  if (method === 'POST') {
    headers['Idempotency-Key'] = options.idempotencyKey ?? crypto.randomUUID();
  }

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${bridgeApiBase()}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new BridgeError(res.status, body, path);
  }
  return parseBridgeResponse<T>(res);
}
