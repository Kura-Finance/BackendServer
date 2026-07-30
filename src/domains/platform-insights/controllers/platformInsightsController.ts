/**
 * HTTP handlers for Investor platform insights (summary, records, backfill).
 */

import { Response } from 'express';
import { Request } from 'express';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { toPlatformRecordResponse } from '../lib/platformRecordResponse';
import type {
  PlatformRecordsListResponse,
  ProcessEventsListResponse,
} from '../models/types';
import { PlatformRecordService } from '../services/platformRevenueService';

/** GET /summary — Investor process + platform revenue snapshot. */
export const getInvestorSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const summary = await PlatformRecordService.getInvestorSummary(from, to);
    sendSuccess(res, summary);
  } catch (error) {
    logError('Get investor summary failed', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to fetch investor summary' });
  }
};

/** GET /records — raw PlatformRecord rows for external queries. */
export const listRecords = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, category, source, product, limit, offset } = req.query as {
      from?: string;
      to?: string;
      category?: string;
      source?: string;
      product?: string;
      limit?: number;
      offset?: number;
    };

    const [records, total] = await Promise.all([
      PlatformRecordService.listRecords({
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(category ? { category } : {}),
        ...(source ? { source } : {}),
        ...(product ? { product } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
      }),
      PlatformRecordService.countRecords({
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(category ? { category } : {}),
        ...(source ? { source } : {}),
        ...(product ? { product } : {}),
      }),
    ]);

    const response: PlatformRecordsListResponse = {
      records: records.map(toPlatformRecordResponse),
      total,
      count: records.length,
    };
    sendSuccess(res, response);
  } catch (error) {
    logError('List platform records failed', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to list platform records' });
  }
};

/** @deprecated use GET /records?category=revenue */
export const listProcessEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, source, limit } = req.query as {
      from?: string;
      to?: string;
      source?: string;
      limit?: number;
    };
    const records = await PlatformRecordService.listRecords({
      category: 'revenue',
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(source ? { source } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    const response: ProcessEventsListResponse = {
      events: records.map(toPlatformRecordResponse),
      count: records.length,
    };
    sendSuccess(res, response);
  } catch (error) {
    logError('List process events failed', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to list process events' });
  }
};

/** POST /backfill — lazy sync of platform records from existing sources. */
export const backfillProcessEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { force } = req.query as { force?: boolean };
    const result = await PlatformRecordService.backfillFromExistingDataIfStale({
      ...(force ? { force: true } : {}),
    });
    sendSuccess(res, result);
  } catch (error) {
    logError('Backfill platform records failed', error as Error);
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to backfill platform records' });
  }
};
