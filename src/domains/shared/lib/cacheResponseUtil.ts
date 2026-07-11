/** Shared cache-source labels for sync/read API responses. */
export const CACHE_SOURCE = {
  FROM_CACHE: 'From cache',
  LIMIT_REACHED: 'Daily refresh limit reached, showing last synced data',
} as const;

export const CACHE_PROVIDER = {
  PLAID: 'Plaid API',
  DEBANK: 'DeBank API',
  EXCHANGE: 'Exchange API',
} as const;

export function cacheSourceForcedRefresh(provider: string): string {
  return `Forced refresh from ${provider}`;
}

export interface CacheResponseFields {
  _cacheSource: string;
  _limitReached?: boolean;
  _message?: string;
}

export function buildCacheResponseFields(options: {
  forceRefresh: boolean;
  limitReached?: boolean;
  message?: string | undefined;
  provider: string;
}): CacheResponseFields {
  if (options.limitReached) {
    return {
      _cacheSource: CACHE_SOURCE.LIMIT_REACHED,
      _limitReached: true,
      ...(options.message ? { _message: options.message } : {}),
    };
  }

  return {
    _cacheSource: options.forceRefresh
      ? cacheSourceForcedRefresh(options.provider)
      : CACHE_SOURCE.FROM_CACHE,
  };
}
