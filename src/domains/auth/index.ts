export { register, login, me, updateProfile } from './controllers/authController';
export type { AuthRequest } from './middleware/auth';
export { requireAuth } from './middleware/auth';
export { default as authRouter } from './router';
export { AuthService } from './services/authService';
export type { UserProfile, RegisterPayload, LoginPayload, UpdateProfilePayload, AuthResponse } from './models/types';
