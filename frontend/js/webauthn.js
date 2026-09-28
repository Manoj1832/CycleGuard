/**
 * CycleGuard — WebAuthn / Passkey Helper
 * Native browser WebAuthn API client with Base64URL conversions.
 * Zero external client dependencies.
 */

import * as API from './api.js';

/**
 * Check if the browser supports WebAuthn.
 */
export function isWebAuthnSupported() {
  return (
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  );
}

/**
 * Check if a platform authenticator (TouchID, FaceID, Windows Hello, Android Biometrics) is available.
 */
export async function isPlatformAuthenticatorAvailable() {
  if (!isWebAuthnSupported()) return false;
  if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (err) {
    console.warn('[WebAuthn] Platform authenticator check error:', err);
    return false;
  }
}

/**
 * Convert Base64URL string to ArrayBuffer.
 */
export function base64URLToBuffer(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

/**
 * Convert ArrayBuffer to Base64URL string.
 */
export function bufferToBase64URL(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  const base64 = window.btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Perform Passkey Registration.
 * Finding F3: Requires authToken (obtained by entering PIN) or setupToken.
 * @param {string|null} authToken
 */
export async function registerPasskey(authToken = null) {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }

  // 1. Fetch registration options from backend
  const options = await API.getWebAuthnRegOptions(authToken);

  // 2. Decode binary fields for navigator.credentials.create
  const publicKey = {
    ...options,
    challenge: base64URLToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64URLToBuffer(options.user.id),
    },
    excludeCredentials: options.excludeCredentials?.map((cred) => ({
      ...cred,
      id: base64URLToBuffer(cred.id),
    })),
  };

  // 3. Prompt user for biometric / passkey
  const credential = await navigator.credentials.create({ publicKey });

  // 4. Encode response to send back to backend
  const credentialJSON = {
    id: credential.id,
    rawId: bufferToBase64URL(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64URL(credential.response.attestationObject),
      clientDataJSON: bufferToBase64URL(credential.response.clientDataJSON),
      transports: credential.response.getTransports ? credential.response.getTransports() : [],
    },
    clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
  };

  // 5. Verify on backend
  return await API.verifyWebAuthnReg(credentialJSON, authToken);
}

/**
 * Perform Passkey Authentication.
 * @param {string|null} action - 'ARM' | 'DISARM' | 'ALARM_CLEAR'
 * @returns {Promise<{ authToken: string }>}
 */
export async function authenticatePasskey(action = null) {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }

  // 1. Fetch challenge options
  const options = await API.getWebAuthnLoginOptions();

  // 2. Decode binary fields for navigator.credentials.get
  const publicKey = {
    ...options,
    challenge: base64URLToBuffer(options.challenge),
    allowCredentials: options.allowCredentials?.map((cred) => ({
      ...cred,
      id: base64URLToBuffer(cred.id),
    })),
  };

  // 3. Prompt user for biometric / passkey
  const assertion = await navigator.credentials.get({ publicKey });

  // 4. Encode assertion response
  const assertionJSON = {
    id: assertion.id,
    rawId: bufferToBase64URL(assertion.rawId),
    type: assertion.type,
    response: {
      authenticatorData: bufferToBase64URL(assertion.response.authenticatorData),
      clientDataJSON: bufferToBase64URL(assertion.response.clientDataJSON),
      signature: bufferToBase64URL(assertion.response.signature),
      userHandle: assertion.response.userHandle ? bufferToBase64URL(assertion.response.userHandle) : null,
    },
    clientExtensionResults: assertion.getClientExtensionResults ? assertion.getClientExtensionResults() : {},
  };

  // 5. Verify on backend and receive single-use authToken
  const result = await API.verifyWebAuthnLogin(assertionJSON, action);
  return result;
}
