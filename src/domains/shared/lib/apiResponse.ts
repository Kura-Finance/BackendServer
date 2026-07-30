/**
 * Standard JSON success/error response helpers for Express handlers.
 */

import { Response } from 'express';

type ErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

/** Send `{ success: true, data, meta? }`. */
export function sendSuccess<T>(
  res: Response,
  data: T,
  status = 200,
  meta?: Record<string, unknown>,
): void {
  res.status(status).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

/** Send `{ success: false, error }`. */
export function sendError(
  res: Response,
  status: number,
  error: ErrorPayload,
): void {
  res.status(status).json({
    success: false,
    error,
  });
}
