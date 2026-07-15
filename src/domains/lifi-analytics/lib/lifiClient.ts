/**
 * LI.FI analytics HTTP client
 * Docs: https://docs.li.fi/api-reference/get-a-paginated-list-of-filtered-transfers
 *
 * LIFI_INTEGRATOR 支援逗號分隔多個 integrator（與前端各端 SDK integrator 對齊），例如：
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

/** 解析 LIFI_INTEGRATOR（逗號 / 空白分隔），去重並保序。 */
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
 * 拉取期間內所有 DONE transfers（v2 分頁，避免 v1 1000 上限）。
 * fromTimestamp / toTimestamp 為 unix seconds。
 * 多個 integrator 以重複 query key 傳入（LI.FI 支援 string | string[]）。
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
