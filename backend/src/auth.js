/**
 * CycleGuard Backend — Authentication
 * WebAuthn Passkeys + 4-digit PIN fallback with backend-enforced lockout.
 */

const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const config = require('./config');

// ---- Rate Limiting & Lockout ----
const failedAttempts = new Map(); // clientId -> { count: number, lockoutUntil: number | null }
const MAX_ATTEMPTS = config.auth.lockoutMaxAttempts || 5;
const LOCKOUT_MS = (config.auth.lockoutDurationSeconds || 30) * 1000;

// ---- In-Memory Auth Tokens (Single-Use, 60s lifetime) ----
const activeAuthTokens = new Map(); // token -> { clientId, action, expiresAt }
const TOKEN_TTL_MS = 60 * 1000;

// Cleanup expired tokens every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of activeAuthTokens.entries()) {
    if (now > data.expiresAt) {
      activeAuthTokens.delete(token);
    }
  }
}, 30000);

// ---- WebAuthn Store ----
// For production, persist to PostgreSQL/MongoDB.
const DEFAULT_USER = {
  id: 'cycleguard-owner-001',
  username: 'owner@cycleguard.local',
  displayName: 'CycleGuard Owner',
};

// Map of credentialID -> { id, publicKey, counter, transports, deviceType, backedUp }
const userCredentials = new Map();

// Map of clientId -> { challenge: string, expiresAt: number }
const activeChallenges = new Map();

/**
 * Get current lockout status for a client.
 * @param {string} clientId
 * @returns {{ lockedOut: boolean, remainingSeconds: number, attemptsRemaining: number }}
 */
function getLockoutStatus(clientId = 'default') {
  const record = failedAttempts.get(clientId);
  if (!record) {
    return { lockedOut: false, remainingSeconds: 0, attemptsRemaining: MAX_ATTEMPTS };
  }

  const now = Date.now();
  if (record.lockoutUntil && now < record.lockoutUntil) {
    const remainingSeconds = Math.ceil((record.lockoutUntil - now) / 1000);
    return { lockedOut: true, remainingSeconds, attemptsRemaining: 0 };
  }

  // Lockout expired or never locked out
  if (record.lockoutUntil && now >= record.lockoutUntil) {
    failedAttempts.delete(clientId);
    return { lockedOut: false, remainingSeconds: 0, attemptsRemaining: MAX_ATTEMPTS };
  }

  const remaining = Math.max(0, MAX_ATTEMPTS - record.count);
  return { lockedOut: false, remainingSeconds: 0, attemptsRemaining: remaining };
}

/**
 * Reset lockout state for a client upon successful authentication.
 * @param {string} clientId
 */
function resetLockout(clientId = 'default') {
  failedAttempts.delete(clientId);
}

/**
 * Generate a single-use authorization token.
 * @param {string} clientId
 * @param {string|null} action - 'ARM' | 'DISARM' | 'ALARM_CLEAR' | null
 * @returns {string}
 */
function createAuthToken(clientId = 'default', action = null) {
  const token = crypto.randomBytes(24).toString('hex');
  activeAuthTokens.set(token, {
    clientId,
    action,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });
  return token;
}

/**
 * Verify and consume a single-use auth token.
 * @param {string} token
 * @param {string|null} expectedAction
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyAndConsumeAuthToken(token, expectedAction = null) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing or invalid authorization token.' };
  }

  const data = activeAuthTokens.get(token);
  if (!data) {
    return { valid: false, error: 'Invalid or already consumed authorization token.' };
  }

  // Check expiration
  if (Date.now() > data.expiresAt) {
    activeAuthTokens.delete(token);
    return { valid: false, error: 'Authorization token expired.' };
  }

  // Check action match if specified
  if (expectedAction && data.action && data.action !== expectedAction) {
    activeAuthTokens.delete(token);
    return { valid: false, error: 'Token not authorized for this action.' };
  }

  // Single-use: delete immediately
  activeAuthTokens.delete(token);
  return { valid: true };
}

/**
 * Verify a 4-digit PIN.
 * @param {string} pin
 * @param {string} clientId
 * @param {string|null} action
 * @returns {{ success: boolean, error?: string, lockedOut?: boolean, remainingSeconds?: number, attemptsRemaining?: number, authToken?: string }}
 */
function verifyPin(pin, clientId = 'default', action = null) {
  // Check lockout first
  const status = getLockoutStatus(clientId);
  if (status.lockedOut) {
    return {
      success: false,
      error: `Too many attempts. Try again in ${status.remainingSeconds}s.`,
      lockedOut: true,
      remainingSeconds: status.remainingSeconds,
      attemptsRemaining: 0,
    };
  }

  // Validate format
  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return {
      success: false,
      error: 'Invalid PIN format. Must be 4 digits.',
      lockedOut: false,
      remainingSeconds: 0,
      attemptsRemaining: status.attemptsRemaining,
    };
  }

  // Check correct PIN
  if (pin === config.defaultPin) {
    resetLockout(clientId);
    const authToken = createAuthToken(clientId, action);
    return {
      success: true,
      authToken,
      attemptsRemaining: MAX_ATTEMPTS,
    };
  }

  // Track failed attempt
  const current = failedAttempts.get(clientId) || { count: 0, lockoutUntil: null };
  current.count += 1;

  if (current.count >= MAX_ATTEMPTS) {
    current.lockoutUntil = Date.now() + LOCKOUT_MS;
    failedAttempts.set(clientId, current);
    const remainingSeconds = Math.ceil(LOCKOUT_MS / 1000);
    return {
      success: false,
      error: `Too many attempts. Try again in ${remainingSeconds}s.`,
      lockedOut: true,
      remainingSeconds,
      attemptsRemaining: 0,
    };
  }

  failedAttempts.set(clientId, current);
  const remaining = MAX_ATTEMPTS - current.count;
  return {
    success: false,
    error: 'Incorrect PIN.',
    lockedOut: false,
    remainingSeconds: 0,
    attemptsRemaining: remaining,
  };
}

// ==============================================================
// WEBAUTHN / PASSKEY IMPLEMENTATION
// ==============================================================

/**
 * Generate WebAuthn registration options.
 * @param {string} clientId
 * @param {string|null} dynamicRpId
 * @returns {Promise<object>}
 */
async function getRegistrationOptions(clientId = 'default', dynamicRpId = null) {
  const user = DEFAULT_USER;
  const userPasskeys = Array.from(userCredentials.values());
  const effectiveRpId = dynamicRpId || config.auth.rpId;

  const options = await generateRegistrationOptions({
    rpName: config.auth.rpName,
    rpID: effectiveRpId,
    userID: isoUint8ArrayFromText(user.id),
    userName: user.username,
    userDisplayName: user.displayName,
    attestationType: 'none',
    excludeCredentials: userPasskeys.map((cred) => ({
      id: cred.id,
      transports: cred.transports,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  activeChallenges.set(clientId, {
    challenge: options.challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  return options;
}

/**
 * Verify WebAuthn registration response and save credential.
 * @param {object} body
 * @param {string} clientId
 * @param {string} origin
 * @param {string|null} dynamicRpId
 * @returns {Promise<{ verified: boolean, error?: string }>}
 */
async function verifyRegistration(body, clientId = 'default', origin = null, dynamicRpId = null) {
  const challengeData = activeChallenges.get(clientId);
  if (!challengeData || Date.now() > challengeData.expiresAt) {
    return { verified: false, error: 'Registration challenge expired or missing.' };
  }

  const effectiveRpId = dynamicRpId || config.auth.rpId;
  const expectedOrigin = resolveOrigin(origin);

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin,
      expectedRPID: effectiveRpId,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;
      userCredentials.set(credential.id, {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: body.response?.transports || credential.transports,
        createdAt: new Date().toISOString(),
      });

      activeChallenges.delete(clientId);
      return { verified: true };
    }

    return { verified: false, error: 'Verification failed.' };
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

/**
 * Generate WebAuthn authentication options.
 * @param {string} clientId
 * @param {string|null} dynamicRpId
 * @returns {Promise<object>}
 */
async function getAuthenticationOptions(clientId = 'default', dynamicRpId = null) {
  const userPasskeys = Array.from(userCredentials.values());
  const effectiveRpId = dynamicRpId || config.auth.rpId;

  const options = await generateAuthenticationOptions({
    rpID: effectiveRpId,
    userVerification: 'preferred',
    allowCredentials: userPasskeys.map((cred) => ({
      id: cred.id,
      transports: cred.transports,
    })),
  });

  activeChallenges.set(clientId, {
    challenge: options.challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  return options;
}

/**
 * Verify WebAuthn authentication assertion.
 * @param {object} body
 * @param {string} clientId
 * @param {string|null} action
 * @param {string} origin
 * @param {string|null} dynamicRpId
 * @returns {Promise<{ verified: boolean, authToken?: string, error?: string }>}
 */
async function verifyAuthentication(body, clientId = 'default', action = null, origin = null, dynamicRpId = null) {
  const challengeData = activeChallenges.get(clientId);
  if (!challengeData || Date.now() > challengeData.expiresAt) {
    return { verified: false, error: 'Authentication challenge expired or missing.' };
  }

  const credential = userCredentials.get(body.id);
  if (!credential) {
    return { verified: false, error: 'Authenticator not registered.' };
  }

  const effectiveRpId = dynamicRpId || config.auth.rpId;
  const expectedOrigin = resolveOrigin(origin);

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challengeData.challenge,
      expectedOrigin,
      expectedRPID: effectiveRpId,
      credential: {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
      },
    });

    if (verification.verified) {
      // Update credential counter
      credential.counter = verification.authenticationInfo.newCounter;
      userCredentials.set(credential.id, credential);

      // Successful auth resets lockout
      resetLockout(clientId);
      activeChallenges.delete(clientId);

      const authToken = createAuthToken(clientId, action);
      return { verified: true, authToken };
    }

    return { verified: false, error: 'Authentication could not be verified.' };
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

/**
 * Helper to match expected origin or fall back to incoming origin.
 */
function resolveOrigin(incomingOrigin) {
  if (incomingOrigin) {
    return incomingOrigin;
  }
  return config.auth.expectedOrigins;
}

/**
 * Convert string to Uint8Array for SimpleWebAuthn userID.
 */
function isoUint8ArrayFromText(str) {
  return new Uint8Array(Buffer.from(str, 'utf-8'));
}

/**
 * Return number of registered passkeys.
 */
function getRegisteredPasskeyCount() {
  return userCredentials.size;
}

/**
 * Mock biometric verification for testing or local environments without authenticators.
 */
function mockVerifyBiometric(clientId = 'default', action = null, shouldSucceed = true) {
  if (shouldSucceed) {
    resetLockout(clientId);
    const authToken = createAuthToken(clientId, action);
    return { verified: true, authToken };
  }
  return { verified: false, error: 'Biometric verification failed.' };
}

module.exports = {
  verifyPin,
  getLockoutStatus,
  resetLockout,
  createAuthToken,
  verifyAndConsumeAuthToken,
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  getRegisteredPasskeyCount,
  mockVerifyBiometric,
};
