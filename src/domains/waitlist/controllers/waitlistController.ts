import { Request, Response } from 'express';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { WaitlistService } from '../services/waitlistService';
import type { JoinWaitlistParams } from '../models/types';

/**
 * 加入 waitlist
 * 路由：POST /api/waitlist
 */
export const joinWaitlist = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, product, name, source, metadata } = req.body as {
      email: string;
      product?: string;
      name?: string;
      source?: string;
      metadata?: Record<string, unknown>;
    };

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const params: JoinWaitlistParams = { email };
    if (product) params.product = product;
    if (name) params.name = name;
    if (source) params.source = source;
    if (metadata) params.metadata = metadata;
    if (ipAddress) params.ipAddress = ipAddress;
    if (userAgent) params.userAgent = userAgent;

    const result = await WaitlistService.join(params);

    sendSuccess(
      res,
      result,
      result.alreadyJoined ? 200 : 201,
    );
  } catch (error) {
    logError('Waitlist join failed', error as Error);
    sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'Failed to join waitlist',
    });
  }
};

/**
 * 查詢 email 是否已在 waitlist
 * 路由：GET /api/waitlist/status?email=
 */
export const getWaitlistStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, product } = req.query as { email: string; product?: string };
    const result = await WaitlistService.getStatus(email, product);
    sendSuccess(res, result);
  } catch (error) {
    logError('Waitlist status lookup failed', error as Error);
    sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'Failed to check waitlist status',
    });
  }
};

/**
 * 取得 waitlist 總人數（landing page 用）
 * 路由：GET /api/waitlist/count
 */
export const getWaitlistCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { product } = req.query as { product?: string };
    const result = await WaitlistService.getCount(product);
    sendSuccess(res, result);
  } catch (error) {
    logError('Waitlist count lookup failed', error as Error);
    sendError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'Failed to fetch waitlist count',
    });
  }
};
