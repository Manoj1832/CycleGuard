/**
 * CycleGuard — Configuration
 * Centralized app configuration. Change these values for different environments.
 */

// Auto-detect host and protocol (works locally, over network IP, or through HTTPS tunnel)
const isBrowser = typeof window !== 'undefined';
const isHttps = isBrowser && window.location.protocol === 'https:';
const currentHost = isBrowser && window.location.hostname ? window.location.hostname : 'localhost';
const isSameServer = isBrowser && (window.location.port === '3000' || !window.location.port || isHttps);

const CONFIG = {
  // ---- API ----
  API_BASE_URL: isSameServer && isBrowser
    ? window.location.origin
    : `http://${currentHost}:3000`,

  // ---- WebSocket ----
  WS_URL: isSameServer && isBrowser
    ? `${isHttps ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    : `ws://${currentHost}:3000/ws`,

  // ---- Device ----
  DEVICE_ID: '001',

  // ---- Reconnection (Ultra-snappy) ----
  WS_RECONNECT_DELAY: 400,     // ms
  WS_MAX_RECONNECT_DELAY: 4000, // ms
  WS_RECONNECT_BACKOFF: 1.2,

  // ---- Ultra-Low Latency & Fast Reflect Timeouts ----
  PIN_VERIFY_DELAY: 20,        // ms after 4th digit (near-instant submission)
  SUCCESS_DISPLAY_TIME: 150,   // ms to show success overlay (fast snap)
  STATE_TRANSITION_DELAY: 0,   // ms before UI state updates (instant reflection)
  COMMAND_TIMEOUT_MS: 4000,    // ms to wait for device confirmation

  // ---- Authentication & WebAuthn ----
  AUTH_MOCK_MODE: false,       // When true, uses simulated biometrics
  RP_ID: isBrowser && window.location.hostname ? window.location.hostname : 'localhost',

  // ---- Mock Mode ----
  MOCK_MODE: false,            // Connect to real backend by default
};

// Freeze config to prevent accidental mutations
Object.freeze(CONFIG);

export default CONFIG;
