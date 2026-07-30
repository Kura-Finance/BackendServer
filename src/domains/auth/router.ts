/**
 * Auth routes.
 *
 * Login is Privy-driven:
 * - Client finishes Privy SDK login → access token (+ identity token)
 * - POST /login verifies and issues our JWT
 * - Web: HttpOnly Cookie; mobile: token in response body (X-Client-Type)
 */

import { Router } from 'express';
import {
  logout,
  me,
  updateProfile,
  updateAvatar,
  updateDisplayName,
  applyReferralCode,
  getMyCashbackHistory,
  withdrawCashback,
  deleteAccount,
} from './controllers/authController';
import { login } from './controllers/privyController';
import {
  setupKeyPair,
  getMyKeyPair,
  rotateKeyPair,
  resetE2EE,
} from './controllers/keyPairController';
import {
  status as passkeyStatus,
  list as passkeyList,
  remove as passkeyRemove,
  registerChallenge as passkeyRegisterChallenge,
  register as passkeyRegister,
  authenticateChallenge as passkeyAuthenticateChallenge,
  authenticate as passkeyAuthenticate,
} from './controllers/passkeyController';
import { requireAuth } from './middleware/auth';
import { validateRequest } from '../shared/middleware/validateRequest';
import {
  privyLoginBodySchema,
  updateDisplayNameBodySchema,
  updateAvatarBodySchema,
  updateProfileBodySchema,
  applyReferralCodeBodySchema,
  cashbackHistoryQuerySchema,
  withdrawCashbackBodySchema,
  keyPairBodySchema,
  passkeyRegisterBodySchema,
  passkeyAuthenticateBodySchema,
} from './schemas/authSchemas';

const router = Router();

// ── Privy login (first login registers) ─────────────────────────────
router.post('/login', validateRequest({ body: privyLoginBodySchema }), login);

// Logout & account maintenance
router.post('/logout', requireAuth, logout);

// ── Phase 3 E2EE key pair (zero-access encryption) ──────────────────
// After login, client generates X25519 keypair, wraps privateKey with Passkey-derived KEK, uploads;
// backend wraps each sync SEK with publicKey and can never decrypt user business data.
router.post('/keys/setup', requireAuth, validateRequest({ body: keyPairBodySchema }), setupKeyPair);    // { publicKey, encryptedPrivateKey, kekSalt? }
router.get('/keys/me', requireAuth, getMyKeyPair);                                                       // → { publicKey, encryptedPrivateKey, kekSalt, algorithm, createdAt }
router.post('/keys/rotate', requireAuth, validateRequest({ body: keyPairBodySchema }), rotateKeyPair);  // Warning: invalidates existing wrappedSek
router.post('/keys/reset', requireAuth, resetE2EE);                                                      // New device/passkey: clear passkey + keypair + encrypted caches → unconfigured

// ── Passkey / WebAuthn (unlock E2EE after login) ────────────────────
router.get('/passkey/status', requireAuth, passkeyStatus);                                                          // → { registered }
router.get('/passkey/register-challenge', requireAuth, passkeyRegisterChallenge);                                   // → WebAuthn registration options
router.post('/passkey/register', requireAuth, validateRequest({ body: passkeyRegisterBodySchema }), passkeyRegister); // { response, encryptedDek }
router.get('/passkey/authenticate-challenge', requireAuth, passkeyAuthenticateChallenge);                           // → WebAuthn authentication options
router.post('/passkey/authenticate', requireAuth, validateRequest({ body: passkeyAuthenticateBodySchema }), passkeyAuthenticate); // { response } → { encryptedDek }

// User profile (auth required)
router.get('/me', requireAuth, me);
router.get('/me/cashback-history', requireAuth, validateRequest({ query: cashbackHistoryQuerySchema }), getMyCashbackHistory); // Cashback history (pending/available/reversed)
router.post('/me/cashback-withdraw', requireAuth, validateRequest({ body: withdrawCashbackBodySchema }), withdrawCashback); // Withdraw available cashback (notify Support)
router.patch('/me', requireAuth, validateRequest({ body: updateProfileBodySchema }), updateProfile);                              // Update profile
router.post('/me/referral-code', requireAuth, validateRequest({ body: applyReferralCodeBodySchema }), applyReferralCode);       // Apply invite code (once)
router.patch('/me/avatar', requireAuth, validateRequest({ body: updateAvatarBodySchema }), updateAvatar);                      // Update avatar
router.patch('/me/display-name', requireAuth, validateRequest({ body: updateDisplayNameBodySchema }), updateDisplayName);      // Update display name
router.delete('/me', requireAuth, deleteAccount);

export default router;
