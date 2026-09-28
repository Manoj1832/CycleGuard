/**
 * CycleGuard — State Manager
 * Centralized, observable application state.
 * All state changes go through this module, which notifies subscribers.
 */

// ---- State shape ----
const initialState = {
  securityState: 'OFF',        // 'OFF' | 'ON' | 'ALARM'
  connectionState: 'DISCONNECTED', // 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING'
  lastActivity: null,          // { message: string, timestamp: string } | null
  alarmActive: false,
  deviceId: '001',

  // Authentication & Sheet State
  authSheetOpen: false,
  authSheetAction: null,       // 'ARM' | 'DISARM' | 'ALARM_CLEAR'
  authFlowState: 'IDLE',       // 'IDLE' | 'BIOMETRIC_PENDING' | 'BIOMETRIC_SUCCESS' | 'BIOMETRIC_FAILED' | 'BIOMETRIC_UNAVAILABLE' | 'PIN_REQUIRED' | 'PIN_VERIFYING' | 'PIN_SUCCESS' | 'PIN_FAILED' | 'LOCKED_OUT'
  authErrorMessage: '',
  authAttemptsRemaining: 5,
  authLockoutSeconds: 0,
  hasPasskeys: false,
  isActionPending: false,      // prevents rapid clicks while awaiting device confirmation
  pendingStatusMessage: null,  // 'Activating security...', 'Disarming...', etc.

  // Legacy compatibility
  pinSheetOpen: false,
  pinSheetAction: null,
  pinError: false,
};

let state = { ...initialState };
const listeners = new Set();

/**
 * Get current state (shallow copy to prevent external mutation).
 * @returns {object}
 */
export function getState() {
  return { ...state };
}

/**
 * Update state and notify all subscribers.
 * @param {object} partial — partial state to merge
 */
export function setState(partial) {
  const prevState = { ...state };
  state = { ...state, ...partial };
  listeners.forEach((fn) => {
    try {
      fn(state, prevState);
    } catch (err) {
      console.error('[State] Listener error:', err);
    }
  });
}

/**
 * Subscribe to state changes.
 * @param {function} fn — called with (newState, prevState)
 * @returns {function} unsubscribe
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Reset to initial state (useful for testing).
 */
export function resetState() {
  setState({ ...initialState });
}
