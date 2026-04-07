import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { logError } from '../../logger';

/**
 * Auth Controller - Request/Response Handling
 */

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.register(email, password);
    res.json(result);
  } catch (error) {
    logError('Register failed', error, { email: req.body.email });
    res.status(500).json({ error: '伺服器錯誤' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    res.json(result);
  } catch (error) {
    logError('Login failed', error, { email: req.body.email });
    res.status(401).json({ error: error instanceof Error ? error.message : '伺服器錯誤' });
  }
};

export const me = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const profile = await AuthService.getCurrentUser(req.userId);
    res.json({ user: profile });
  } catch (error) {
    logError('Fetch current user profile failed', error, { userId: (req as AuthRequest).userId });
    res.status(404).json({ error: error instanceof Error ? error.message : '伺服器錯誤' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: '未登入' });
      return;
    }

    const { displayName, avatarUrl } = req.body;
    const updatedProfile = await AuthService.updateUserProfile(req.userId, { displayName, avatarUrl });

    res.json({ user: updatedProfile });
  } catch (error) {
    logError('Update profile failed', error, { userId: (req as AuthRequest).userId });
    res.status(500).json({ error: '伺服器錯誤' });
  }
};
