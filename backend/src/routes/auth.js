/**
 * CycleGuard Backend — Auth Routes
 * WebAuthn Passkeys & PIN verification endpoints.
 */

const express = require('express');
const auth = require('../auth');
const config = require('../config');

const router = express.Router();

/**
 * GET /api/auth/status
 * Check current client lockout status and passkey availability.
 */
router.get('/status', (req, res) => {
  const clientId = req.ip;
  const status = auth.getLockoutStatus(clientId);
  const passkeyCount = auth.getRegisteredPasskeyCount();

  res.json({
    success: true,
    lockedOut: status.lockedOut,
    remainingSeconds: status.remainingSeconds,
    attemptsRemaining: status.attemptsRemaining,
    hasPasskeys: passkeyCount > 0,
    passkeyCount,
    mockMode: config.auth.mockMode,
  });
});

/**
 * POST /api/auth/pin/verify
 * Server-side PIN verification with backend lockout enforcement.
 */
router.post('/pin/verify', (req, res) => {
  const { pin, action } = req.body;
  const clientId = req.ip;

  const result = auth.verifyPin(pin, clientId, action);

  if (!result.success) {
    return res.status(401).json({
      success: false,
      error: result.error,
      lockedOut: result.lockedOut,
      remainingSeconds: result.remainingSeconds,
      attemptsRemaining: result.attemptsRemaining,
    });
  }

  res.json({
    success: true,
    authToken: result.authToken,
    attemptsRemaining: result.attemptsRemaining,
  });
});

/**
 * Helper to check authorization for passkey registration.
 * Finding F3: Requires either a verified PIN authToken or SETUP_TOKEN.
 */
function checkRegistrationAuth(req) {
  const authHeader = req.get('Authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
  const tokenCandidate = bearerToken || req.body?.authToken || req.body?.setupToken || req.query?.setupToken;

  // 1. Check SETUP_TOKEN if configured in environment
  if (config.setupToken && tokenCandidate === config.setupToken) {
    return { authorized: true };
  }

  // 2. Check authToken from verified PIN
  if (tokenCandidate) {
    const tokenCheck = auth.verifyAndConsumeAuthToken(tokenCandidate);
    if (tokenCheck.valid) {
      return { authorized: true };
    }
  }

  return {
    authorized: false,
    error: 'Passkey registration requires authorization. Enter PIN first or provide SETUP_TOKEN.',
  };
}

/**
 * POST /api/auth/webauthn/register/options
 * Generate passkey registration options. Requires authorization.
 */
router.post('/webauthn/register/options', async (req, res) => {
  const authCheck = checkRegistrationAuth(req);
  if (!authCheck.authorized) {
    return res.status(401).json({ success: false, error: authCheck.error });
  }

  const clientId = req.ip;
  const rpId = req.hostname;
  try {
    const options = await auth.getRegistrationOptions(clientId, rpId);
    res.json(options);
  } catch (err) {
    console.error('[WebAuthn] Register options error:', err.message);
    res.status(500).json({ error: 'Failed to generate registration options' });
  }
});

/**
 * POST /api/auth/webauthn/register/verify
 * Verify and store new passkey credential.
 */
router.post('/webauthn/register/verify', async (req, res) => {
  const clientId = req.ip;
  const origin = req.get('Origin') || req.get('Referer');
  const rpId = req.hostname;
  const { credential, response } = req.body;
  const regPayload = credential || response || req.body;

  try {
    const verification = await auth.verifyRegistration(regPayload, clientId, origin, rpId);
    if (!verification.verified) {
      return res.status(400).json({ success: false, error: verification.error });
    }
    res.json({ success: true, message: 'Passkey registered successfully.' });
  } catch (err) {
    console.error('[WebAuthn] Register verify error:', err.message);
    res.status(500).json({ success: false, error: 'Registration verification error' });
  }
});

/**
 * POST /api/auth/webauthn/login/options
 * Generate authentication challenge options.
 */
router.post('/webauthn/login/options', async (req, res) => {
  const clientId = req.ip;
  const rpId = req.hostname;
  try {
    const options = await auth.getAuthenticationOptions(clientId, rpId);
    res.json(options);
  } catch (err) {
    console.error('[WebAuthn] Login options error:', err.message);
    res.status(500).json({ error: 'Failed to generate authentication options' });
  }
});

/**
 * POST /api/auth/webauthn/login/verify
 * Verify passkey assertion and issue single-use authorization token.
 */
router.post('/webauthn/login/verify', async (req, res) => {
  const clientId = req.ip;
  const origin = req.get('Origin') || req.get('Referer');
  const rpId = req.hostname;
  const { response, action } = req.body;

  try {
    const verification = await auth.verifyAuthentication(response, clientId, action, origin, rpId);
    if (!verification.verified) {
      return res.status(401).json({ success: false, error: verification.error });
    }

    res.json({
      success: true,
      authToken: verification.authToken,
    });
  } catch (err) {
    console.error('[WebAuthn] Login verify error:', err.message);
    res.status(500).json({ success: false, error: 'Authentication verification error' });
  }
});

/**
 * POST /api/auth/mock/verify
 * Mock biometric verification for testing environments.
 */
router.post('/mock/verify', (req, res) => {
  // Finding F2: Block mock verify in production or when mockMode is disabled
  if (!config.auth.mockMode || config.nodeEnv === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const clientId = req.ip;
  const { action, shouldSucceed = true } = req.body;

  const result = auth.mockVerifyBiometric(clientId, action, shouldSucceed !== false);
  if (!result.verified) {
    return res.status(401).json({ success: false, error: result.error });
  }

  res.json({
    success: true,
    authToken: result.authToken,
  });
});

module.exports = router;
