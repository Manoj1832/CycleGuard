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
const fs = require('fs');
const path = require('path');
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

// ---- WebAuthn Store & Disk Persistence (Finding F3 & F6) ----
const DATA_DIR = config.dataDir;
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials.json');

const DEFAULT_USER = {
  id: 'cycleguard-owner-001',
  username: 'owner@cycleguard.local',
  displayName: 'CycleGuard Owner',
};

// Map of credentialID -> { id, publicKey, counter, transports, createdAt }
const userCredentials = new Map();

function loadCredentialsFromDisk() {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach((cred) => {
          if (cred && cred.id) {
            // Restore binary publicKey Buffer if serialized
            if (cred.publicKey && typeof cred.publicKey === 'object' && cred.publicKey.type === 'Buffer') {
              cred.publicKey = Buffer.from(cred.publicKey.data);
            } else if (typeof cred.publicKey === 'string') {
              cred.publicKey = Buffer.from(cred.publicKey, 'base64');
            }
            userCredentials.set(cred.id, cred);
          }
        });
        console.log(`[WebAuthn] Restored ${userCredentials.size} passkeys from disk store.`);
      }
    }
  } catch (err) {
    console.error('[WebAuthn] Error restoring credentials from disk:', err.message);
  }
}

function saveCredentialsToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(userCredentials.values()).map((cred) => ({
      ...cred,
      publicKey: Buffer.isBuffer(cred.publicKey) ? cred.publicKey.toString('base64') : cred.publicKey,
    }));
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[WebAuthn] Error saving credentials to disk:', err.message);
  }
}

// Load credentials on startup
loadCredentialsFromDisk();

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
 * Timing-safe PIN verification supporting scrypt PIN_HASH and constant-time fallback.
 * Finding F4: Prevents timing attacks and supports salted hash storage.
 * @param {string} inputPin
 * @returns {boolean}
 */
function pinMatches(inputPin) {
  if (!inputPin || typeof inputPin !== 'string') return false;

  // 1. Salted scrypt hash mode: PIN_HASH="<saltHex>:<hashHex>"
  if (config.pinHash && config.pinHash.includes(':')) {
    try {
      const [saltHex, hashHex] = config.pinHash.split(':');
      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(hashHex, 'hex');
      const derived = crypto.scryptSync(inputPin, salt, expected.length);
      return crypto.timingSafeEqual(derived, expected);
    } catch (err) {
      console.error('[Auth] Error verifying PIN hash:', err.message);
      return false;
    }
  }

  // 2. Constant-time comparison against DEFAULT_PIN (dev only). No hardcoded fallback:
  //    if nothing is configured, every PIN is rejected.
  if (!config.defaultPin) return false;
  const targetPin = config.defaultPin;
  const targetBuf = Buffer.from(targetPin, 'utf8');
  const inputBuf = Buffer.from(inputPin, 'utf8');

  if (targetBuf.length !== inputBuf.length) {
    crypto.timingSafeEqual(targetBuf, targetBuf);
    return false;
  }

  return crypto.timingSafeEqual(inputBuf, targetBuf);
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
  if (!pin || typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
    return {
      success: false,
      error: 'Invalid PIN format. Must be numeric.',
      lockedOut: false,
      remainingSeconds: 0,
      attemptsRemaining: status.attemptsRemaining,
    };
  }

  // Check correct PIN using timing-safe comparison
  if (pinMatches(pin)) {
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

      // Finding F3 & F6: Persist credentials to disk immediately
      saveCredentialsToDisk();

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
      // Update credential counter and persist
      credential.counter = verification.authenticationInfo.newCounter;
      userCredentials.set(credential.id, credential);
      saveCredentialsToDisk();

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
