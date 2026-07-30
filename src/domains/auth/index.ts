/**
 * Auth domain public exports (controllers, middleware, services, router).
 */

export {
  me,
  updateProfile,
  updateAvatar,
  updateDisplayName,
  applyReferralCode,
  getMyCashbackHistory,
  withdrawCashback,
  logout,
  deleteAccount,
} from './controllers/authController';
export { login } from './controllers/privyController';
export * as PasskeyService from './services/passkeyService';
export type { AuthRequest } from './middleware/auth';
export { requireAuth } from './middleware/auth';
export { default as authRouter } from './router';
export { AuthService } from './services/authService';
export * as PrivyService from './services/privyService';
export type { UserProfile, UpdateProfilePayload } from './models/types';
