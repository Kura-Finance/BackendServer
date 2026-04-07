/**
 * Auth Domain Model Types
 */

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  membershipLabel: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface UpdateProfilePayload {
  displayName?: string;
  avatarUrl?: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}
