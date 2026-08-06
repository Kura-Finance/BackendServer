/**
 * Admin controllers for dashboard read APIs (users, overview, FeeWarp, Li.Fi).
 */

import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { logError } from '../../logger';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import { AdminDashboardService } from '../services/adminDashboardService';

/** GET /api/admin/users */
export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await AdminDashboardService.listUsers();
    sendSuccess(res, users);
  } catch (error) {
    logError('Admin list users failed', error as Error, { userId: req.userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to list users' });
  }
};

/** GET /api/admin/users/:id */
export const getUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const user = await AdminDashboardService.getUser(id);
    if (!user) {
      sendError(res, 404, { code: 'NOT_FOUND', message: 'User not found' });
      return;
    }
    sendSuccess(res, user);
  } catch (error) {
    logError('Admin get user failed', error as Error, {
      userId: req.userId,
      targetUserId: req.params.id,
    });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to get user' });
  }
};

/** GET /api/admin/overview */
export const getOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const overview = await AdminDashboardService.getOverview();
    sendSuccess(res, overview);
  } catch (error) {
    logError('Admin overview failed', error as Error, { userId: req.userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to get overview' });
  }
};

/** GET /api/admin/earn/fee-warps */
export const getFeeWarps = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const vaults = await AdminDashboardService.getFeeWarps();
    sendSuccess(res, vaults);
  } catch (error) {
    logError('Admin fee-warps failed', error as Error, { userId: req.userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to get FeeWarp vaults' });
  }
};

/** GET /api/admin/lifi/summary */
export const getLifiSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const summary = await AdminDashboardService.getLifiSummary();
    sendSuccess(res, summary);
  } catch (error) {
    logError('Admin Li.Fi summary failed', error as Error, { userId: req.userId });
    sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Failed to get Li.Fi summary' });
  }
};
