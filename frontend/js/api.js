/**
 * CycleGuard — API Client
 * HTTP API calls to backend (Device, Health, WebAuthn & PIN Authentication).
 */

import CONFIG from './config.js';

/**
 * Fetch wrapper with JSON handling and structured error info.
 */
async function request(method, path, body = null) {
  const url = `${CONFIG.API_BASE_URL}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const err = new Error(data.error || `HTTP ${response.status}`);
      err.status = response.status;
      err.data = data;
      err.lockedOut = data.lockedOut;
      err.remainingSeconds = data.remainingSeconds;
      err.attemptsRemaining = data.attemptsRemaining;
      throw err;
    }

    return data;
  } catch (err) {
    console.error(`[API] ${method} ${path} failed:`, err.message);
    throw err;
  }
}

/**
 * Check backend health.
 */
export function checkHealth() {
  return request('GET', '/api/health');
}

/**
 * Get device status.
 */
export function getDeviceStatus(deviceId = CONFIG.DEVICE_ID) {
  return request('GET', `/api/device/${deviceId}/status`);
}

/**
 * Get authentication and lockout status.
 */
export function getAuthStatus() {
  return request('GET', '/api/auth/status');
}

/**
 * Verify PIN server-side.
 */
export function verifyPin(pin, action = null) {
  return request('POST', '/api/auth/pin/verify', { pin, action });
}

/**
 * Get WebAuthn registration options.
 * Finding F3: Requires authToken (from PIN) or SETUP_TOKEN.
 */
export function getWebAuthnRegOptions(authToken = null) {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  return request('POST', '/api/auth/webauthn/register/options', { authToken }, headers);
}

/**
 * Verify WebAuthn registration response.
 */
export function verifyWebAuthnReg(body, authToken = null) {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  return request('POST', '/api/auth/webauthn/register/verify', { ...body, authToken }, headers);
}

/**
 * Get WebAuthn login options.
 */
export function getWebAuthnLoginOptions() {
  return request('POST', '/api/auth/webauthn/login/options');
}

/**
 * Verify WebAuthn assertion response.
 */
export function verifyWebAuthnLogin(response, action = null) {
  return request('POST', '/api/auth/webauthn/login/verify', { response, action });
}

/**
 * Mock biometric verification.
 */
export function mockBiometricVerify(action = null, shouldSucceed = true) {
  return request('POST', '/api/auth/mock/verify', { action, shouldSucceed });
}

/**
 * Normalize credentials input ({ authToken } or { pin } or raw pin string).
 */
function normalizeAuth(credentials) {
  if (typeof credentials === 'string') {
    return { pin: credentials };
  }
  return credentials || {};
}

/**
 * Arm device (turn security ON).
 */
export function armDevice(deviceId = CONFIG.DEVICE_ID, credentials = {}) {
  const payload = normalizeAuth(credentials);
  return request('POST', `/api/device/${deviceId}/arm`, payload);
}

/**
 * Disarm device (turn security OFF).
 */
export function disarmDevice(deviceId = CONFIG.DEVICE_ID, credentials = {}) {
  const payload = normalizeAuth(credentials);
  return request('POST', `/api/device/${deviceId}/disarm`, payload);
}

/**
 * Clear alarm.
 */
export function clearAlarm(deviceId = CONFIG.DEVICE_ID, credentials = {}) {
  const payload = normalizeAuth(credentials);
  return request('POST', `/api/device/${deviceId}/alarm/clear`, payload);
}

// ---- Journal & Events API ----

/**
 * Get event history with filters.
 */
export function getEvents(deviceId = CONFIG.DEVICE_ID, params = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.type) query.set('type', params.type);
  if (params.source) query.set('source', params.source);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return request('GET', `/api/device/${deviceId}/events${qs ? '?' + qs : ''}`);
}

/**
 * Get journal summary for a date.
 */
export function getJournalSummary(deviceId = CONFIG.DEVICE_ID, date = null) {
  const qs = date ? `?date=${date}` : '';
  return request('GET', `/api/device/${deviceId}/journal/summary${qs}`);
}

/**
 * Confirm bicycle parking (user-confirmed ground truth).
 */
export function confirmParking(deviceId = CONFIG.DEVICE_ID) {
  return request('POST', `/api/device/${deviceId}/journal/confirm-parking`);
}

/**
 * Get ML-powered security coach recommendations.
 */
export function getSecurityCoach(deviceId = CONFIG.DEVICE_ID) {
  return request('GET', `/api/device/${deviceId}/security-coach`);
}
