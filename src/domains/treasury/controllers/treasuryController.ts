/**
 * Treasury HTTP handlers for workspace CRUD and active selection.
 */
import { Request, Response } from 'express';
import { TreasuryService } from '../services/treasuryService';
import { sendSuccess, sendError } from '../../shared/lib/apiResponse';
import { logError } from '../../logger';
import type { TreasurySource } from '../models/types';

function userIdOf(req: Request): string {
  return (req as Request & { userId: string }).userId;
}

/** Map service errors with status/code to API responses; otherwise 500. */
function serviceError(res: Response, error: unknown, fallback: string): void {
  const err = error as Error & { status?: number; code?: string };
  if (err.status && err.code) {
    sendError(res, err.status, { code: err.code, message: err.message || fallback });
    return;
  }
  logError(fallback, error);
  sendError(res, 500, { code: 'INTERNAL_ERROR', message: fallback });
}

/** GET /api/treasuries — list workspace and active treasury. */
export const listTreasuries = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = await TreasuryService.getWorkspace(userIdOf(req));
    sendSuccess(res, workspace);
  } catch (error) {
    serviceError(res, error, 'Failed to list treasuries');
  }
};

/** POST /api/treasuries — create (or activate existing by address). */
export const createTreasury = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      id?: string;
      name?: string;
      address: string;
      source: TreasurySource;
      saltNonce?: string;
    };
    const treasury = await TreasuryService.create(userIdOf(req), body);
    sendSuccess(res, treasury, 201);
  } catch (error) {
    serviceError(res, error, 'Failed to create treasury');
  }
};

/** PATCH /api/treasuries/:id — rename. */
export const patchTreasury = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const { name } = req.body as { name: string };
    const treasury = await TreasuryService.rename(userIdOf(req), id, name);
    sendSuccess(res, treasury);
  } catch (error) {
    serviceError(res, error, 'Failed to update treasury');
  }
};

/** DELETE /api/treasuries/:id — remove and return updated workspace. */
export const deleteTreasury = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params as { id: string };
    const workspace = await TreasuryService.remove(userIdOf(req), id);
    sendSuccess(res, workspace);
  } catch (error) {
    serviceError(res, error, 'Failed to delete treasury');
  }
};

/** PUT /api/treasuries/active — set activeTreasuryId. */
export const setActiveTreasury = async (req: Request, res: Response): Promise<void> => {
  try {
    const { activeTreasuryId } = req.body as { activeTreasuryId: string | null };
    const workspace = await TreasuryService.setActive(userIdOf(req), activeTreasuryId);
    sendSuccess(res, workspace);
  } catch (error) {
    serviceError(res, error, 'Failed to set active treasury');
  }
};

/** PUT /api/treasuries — replace entire workspace (migration / bulk import). */
export const replaceTreasuries = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      activeTreasuryId: string | null;
      treasuries: Array<{
        id?: string;
        name?: string;
        address: string;
        source: TreasurySource;
        saltNonce?: string;
        createdAt?: string;
      }>;
    };
    const workspace = await TreasuryService.replaceAll(userIdOf(req), body);
    sendSuccess(res, workspace);
  } catch (error) {
    serviceError(res, error, 'Failed to replace treasuries');
  }
};
