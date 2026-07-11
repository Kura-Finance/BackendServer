/**
 * Gnosis Pay KYC Controllers (Sumsub-powered)
 *
 * GET  /api/card/gp/kyc/url        → Sumsub web iframe URL
 * GET  /api/card/gp/kyc/sdk-token  → Sumsub mobile SDK token
 * GET  /api/card/gp/sof            → fetch SoF questions
 * POST /api/card/gp/sof            → submit source-of-funds answers [{question,answer}]
 * POST /api/card/gp/phone/send     → send phone OTP
 * POST /api/card/gp/phone/verify   → verify phone OTP
 */

import { Response } from 'express';
import { AuthRequest } from '../../auth/middleware/auth';
import { sendError, sendSuccess } from '../../shared/lib/apiResponse';
import * as GnosisPayService from '../services/gnosisPayService';
import { appLogger } from '../../logger';

function handleGpError(err: unknown, res: Response): void {
  if (err instanceof GnosisPayService.GnosisPayError) {
    if (err.isUnauthorized) {
      sendError(res, 401, { code: 'GP_SESSION_EXPIRED', message: 'GP session expired. Please re-authenticate.' });
      return;
    }
    sendError(res, 502, { code: 'GP_API_ERROR', message: 'Gnosis Pay API error', details: err.gpBody });
    return;
  }
  appLogger.error('[GP KYC Controller] Unexpected error', { error: err instanceof Error ? err.message : String(err) });
  sendError(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
}

export async function getKycWebUrl(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const data = await GnosisPayService.getKycWebUrl(userId);
    sendSuccess(res, data);
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function getKycSdkToken(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const data = await GnosisPayService.getKycSdkToken(userId);
    sendSuccess(res, data);
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function getSofQuestions(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  try {
    const questions = await GnosisPayService.getSofQuestions(userId);
    sendSuccess(res, { questions });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function submitSourceOfFunds(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const answers = req.body as GnosisPayService.SofAnswer[];
  if (!Array.isArray(answers)) {
    sendError(res, 400, { code: 'VALIDATION_ERROR', message: 'Body must be an array of {question, answer}' });
    return;
  }
  try {
    await GnosisPayService.submitSourceOfFunds(userId, answers);
    sendSuccess(res, { success: true });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function sendPhoneOtp(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { phone } = req.body as { phone: string };
  try {
    await GnosisPayService.sendPhoneOtp(userId, phone);
    sendSuccess(res, { success: true });
  } catch (err) {
    handleGpError(err, res);
  }
}

export async function verifyPhoneOtp(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { code } = req.body as { code: string };
  try {
    await GnosisPayService.verifyPhoneOtp(userId, code);
    sendSuccess(res, { success: true });
  } catch (err) {
    handleGpError(err, res);
  }
}
