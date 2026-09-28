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
 */
export function getWebAuthnRegOptions() {
  return request('POST', '/api/auth/webauthn/register/options');
}

/**
 * Verify WebAuthn registration response.
 */
export function verifyWebAuthnReg(body) {
  return request('POST', '/api/auth/webauthn/register/verify', body);
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
