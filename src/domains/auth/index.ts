export {
  me,
  updateProfile,
  updateAvatar,
  updateDisplayName,
  requestPasswordReset,
  resetPassword,
  deleteAccount,
  sendVerificationCode,
  verifyEmailAndRegister,
  requestEmailChange,
  confirmEmailChange,
} from './controllers/authController';
export type { AuthRequest } from './middleware/auth';
export { requireAuth } from './middleware/auth';
export { default as authRouter } from './router';
export { AuthService } from './services/authService';
export type { UserProfile, UpdateProfilePayload } from './models/types';
