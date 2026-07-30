/**
 * LI.FI analytics HTTP client.
 * Docs: https://docs.li.fi/api-reference/get-a-paginated-list-of-filtered-transfers
 *
 * LIFI_INTEGRATOR accepts comma-separated integrators (aligned with client SDK names), e.g.:
 *   LIFI_INTEGRATOR=kura-ios,kura-android,kura-web
 */

import { appLogger } from '../../logger';
import type { LifiTransferStatus } from '../models/types';

const LIFI_BASE_URL = 'https://li.quest';
const PAGE_LIMIT = 100;

export class LifiApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'LifiApiError';
  }
}

/** Parse LIFI_INTEGRATOR (comma/whitespace-separated); dedupe, preserve order. */
export function getIntegrators(): string[] {
  const raw = process.env.LIFI_INTEGRATOR?.trim();
  if (!raw) {
    throw new Error('LIFI_INTEGRATOR is not configured');
  }

  const seen = new Set<string>();
  const list: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const name = part.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    list.push(name);
  }

  if (list.length === 0) {
    throw new Error('LIFI_INTEGRATOR is not configured');
  }
  return list;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = process.env.LIFI_API_KEY?.trim();
  if (apiKey) {
    headers['x-lifi-api-key'] = apiKey;
  }
  return headers;
}

interface PaginatedTransfersResponse {
  hasNext?: boolean;
  next?: string | null;
  data?: LifiTransferStatus[];
}

/**
 * Fetch all DONE transfers in the window (v2 pagination; avoids v1 1000 cap).
 * fromTimestamp / toTimestamp are unix seconds.
 * Multiple integrators are passed as repeated query keys (LI.FI accepts string | string[]).
 */
export async function fetchDoneTransfers(params: {
  fromTimestamp: number;
  toTimestamp: number;
}): Promise<{ integrators: string[]; transfers: LifiTransferStatus[] }> {
  const integrators = getIntegrators();
  const transfers: LifiTransferStatus[] = [];
  let cursor: string | null = null;
  let page = 0;

  do {
    page += 1;
    const query = new URLSearchParams({
      status: 'DONE',
      fromTimestamp: String(params.fromTimestamp),
      toTimestamp: String(params.toTimestamp),
      limit: String(PAGE_LIMIT),
    });
    for (const name of integrators) {
      query.append('integrator', name);
    }
    if (cursor) {
      query.set('next', cursor);
    }

    const url = `${LIFI_BASE_URL}/v2/analytics/transfers?${query.toString()}`;
    const res = await fetch(url, { method: 'GET', headers: authHeaders() });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new LifiApiError(res.status, `LI.FI analytics failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as PaginatedTransfersResponse;
    const batch = Array.isArray(json.data) ? json.data : [];
    transfers.push(...batch);

    cursor = json.hasNext && json.next ? json.next : null;

    appLogger.info('[LifiClient] Fetched analytics page', {
      page,
      batchSize: batch.length,
      totalSoFar: transfers.length,
      hasNext: Boolean(cursor),
      integrators,
    });
  } while (cursor);

  return { integrators, transfers };
}
