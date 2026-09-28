/**
 * CycleGuard — Unified Authentication Module
 * Primary: WebAuthn Passkeys / Biometrics
 * Fallback: 4-digit PIN with backend-enforced lockout
 *
 * Coordinates authentication bottom sheet, state transitions,
 * and authorized execution of ARM / DISARM / ALARM_CLEAR commands.
 */

import CONFIG from './config.js';
import { getState, setState, subscribe } from './state.js';
import * as API from './api.js';
import * as WebAuthn from './webauthn.js';
import * as Icons from './icons.js';

// ---- Module State ----
let currentAction = null; // 'ARM' | 'DISARM' | 'ALARM_CLEAR'
let pinDigits = [];
let isVerifying = false;
let lockoutTimerId = null;
let commandTimeoutId = null;
let currentRemainingSeconds = 0;

// Cached DOM Elements
let els = {};

/**
 * Initialize Authentication Module.
 */
export function initAuth() {
  cacheDOMElements();
  bindEvents();
  checkInitialLockout();
}

/**
 * Cache DOM elements for bottom sheet and views.
 */
function cacheDOMElements() {
  els = {
    backdrop: document.getElementById('sheet-backdrop'),
    sheet: document.getElementById('auth-sheet') || document.getElementById('pin-sheet'),
    views: {
      biometric: document.getElementById('auth-view-biometric'),
      pin: document.getElementById('auth-view-pin'),
      lockout: document.getElementById('auth-view-lockout'),
    },
    biometric: {
      icon: document.getElementById('bio-icon'),
      title: document.getElementById('bio-title'),
      subtitle: document.getElementById('bio-subtitle'),
      actionBtn: document.getElementById('bio-action-btn'),
      fallbackBtn: document.getElementById('bio-fallback-btn'),
      cancelBtn: document.getElementById('bio-cancel-btn'),
    },
    pin: {
      title: document.getElementById('pin-title'),
      subtitle: document.getElementById('pin-subtitle'),
      dotsContainer: document.getElementById('pin-dots'),
      dots: document.querySelectorAll('.pin-dot'),
      errorText: document.getElementById('pin-error'),
      attemptsText: document.getElementById('pin-attempts'),
      switchToBioBtn: document.getElementById('pin-switch-bio'),
      cancelBtn: document.getElementById('pin-cancel'),
    },
    lockout: {
      title: document.getElementById('lockout-title'),
      countdown: document.getElementById('lockout-countdown'),
      cancelBtn: document.getElementById('lockout-cancel'),
    },
    overlay: document.getElementById('success-overlay'),
  };
}

/**
 * Bind event listeners.
 */
function bindEvents() {
  // Backdrop close
  if (els.backdrop) {
    els.backdrop.addEventListener('click', () => {
      if (!isVerifying) closeAuthSheet();
    });
  }

  // Biometric view buttons
  if (els.biometric.actionBtn) {
    els.biometric.actionBtn.addEventListener('click', handleBiometricClick);
  }
  if (els.biometric.fallbackBtn) {
    els.biometric.fallbackBtn.addEventListener('click', () => switchView('PIN_REQUIRED'));
  }
  if (els.biometric.cancelBtn) {
    els.biometric.cancelBtn.addEventListener('click', closeAuthSheet);
  }

  // PIN view buttons
  if (els.pin.switchToBioBtn) {
    els.pin.switchToBioBtn.addEventListener('click', () => switchView('BIOMETRIC_PENDING'));
  }
  if (els.pin.cancelBtn) {
    els.pin.cancelBtn.addEventListener('click', closeAuthSheet);
  }

  // Lockout cancel
  if (els.lockout.cancelBtn) {
    els.lockout.cancelBtn.addEventListener('click', closeAuthSheet);
  }

  // Keypad keys
  document.querySelectorAll('.keypad__key').forEach((key) => {
    key.addEventListener('click', () => handlePinKeypadPress(key.dataset.key));
  });

  // Physical keyboard support
  document.addEventListener('keydown', handleKeyboardInput);

  // Subscribe to device status changes to handle command confirmations
  subscribe(onDeviceStateChanged);
}

/**
 * Check backend for existing lockout on startup.
 */
async function checkInitialLockout() {
  try {
    const status = await API.getAuthStatus();
    setState({
      hasPasskeys: status.hasPasskeys,
      authAttemptsRemaining: status.attemptsRemaining,
    });

    if (status.lockedOut && status.remainingSeconds > 0) {
      startLockoutCountdown(status.remainingSeconds);
    }
  } catch (err) {
    console.warn('[Auth] Could not fetch auth status:', err.message);
  }
}

/**
 * Open authentication bottom sheet for a given security action.
 * @param {'ARM' | 'DISARM' | 'ALARM_CLEAR'} action
 */
export async function openAuthSheet(action) {
  // Prevent duplicate opens while an action is already pending
  const currentState = getState();
  if (currentState.isActionPending) {
    console.warn('[Auth] Action already pending confirmation, ignoring tap.');
    return;
  }

  currentAction = action;
  pinDigits = [];
  isVerifying = false;
  hidePinError();
  updatePinDots();

  // Open bottom sheet
  els.backdrop?.classList.add('sheet-backdrop--visible');
  els.sheet?.classList.add('pin-sheet--open');
  els.sheet?.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  setState({
    authSheetOpen: true,
    authSheetAction: action,
    pinSheetOpen: true, // legacy
    pinSheetAction: action, // legacy
  });

  // Check lockout status
  try {
    const status = await API.getAuthStatus();
    if (status.lockedOut && status.remainingSeconds > 0) {
      startLockoutCountdown(status.remainingSeconds);
      return;
    }
    setState({ authAttemptsRemaining: status.attemptsRemaining });
  } catch (e) {
    // Continue with client state if offline
  }

  // Determine starting view: WebAuthn or PIN
  const bioAvailable = WebAuthn.isWebAuthnSupported() || CONFIG.AUTH_MOCK_MODE;

  if (bioAvailable) {
    switchView('BIOMETRIC_PENDING');
    // Attempt biometric prompt automatically after a short delay for smooth sheet slide-up
    setTimeout(() => {
      const state = getState();
      if (state.authSheetOpen && state.authFlowState === 'BIOMETRIC_PENDING') {
        triggerBiometricVerification();
      }
    }, 350);
  } else {
    switchView('BIOMETRIC_UNAVAILABLE');
  }
}

/**
 * Close authentication bottom sheet.
 */
export function closeAuthSheet() {
  if (isVerifying) return;

  els.backdrop?.classList.remove('sheet-backdrop--visible');
  els.sheet?.classList.remove('pin-sheet--open');
  els.sheet?.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  pinDigits = [];
  updatePinDots();
  hidePinError();

  currentAction = null;
  setState({
    authSheetOpen: false,
    authSheetAction: null,
    authFlowState: 'IDLE',
    authErrorMessage: '',
    pinSheetOpen: false,
    pinSheetAction: null,
    pinError: false,
  });
}

/**
 * Switch active view in the authentication bottom sheet.
 * @param {'BIOMETRIC_PENDING' | 'BIOMETRIC_FAILED' | 'BIOMETRIC_UNAVAILABLE' | 'PIN_REQUIRED' | 'LOCKED_OUT'} flowState
 */
export function switchView(flowState, message = '') {
  setState({ authFlowState: flowState, authErrorMessage: message });

  // Hide all views first
  if (els.views.biometric) els.views.biometric.style.display = 'none';
  if (els.views.pin) els.views.pin.style.display = 'none';
  if (els.views.lockout) els.views.lockout.style.display = 'none';

  switch (flowState) {
    case 'BIOMETRIC_PENDING':
      renderBiometricView({
        title: 'Verify Identity',
        subtitle: getActionDescription(currentAction),
        btnText: 'Use Biometric',
        showRetry: false,
        pulseIcon: true,
      });
      if (els.views.biometric) els.views.biometric.style.display = 'block';
      break;

    case 'BIOMETRIC_FAILED':
      renderBiometricView({
        title: 'Verification Failed',
        subtitle: message || 'Biometric verification failed. Try again or use PIN.',
        btnText: 'Try Again',
        showRetry: true,
        pulseIcon: false,
      });
      if (els.views.biometric) els.views.biometric.style.display = 'block';
      break;

    case 'BIOMETRIC_UNAVAILABLE':
      renderBiometricView({
        title: 'Biometric Unavailable',
        subtitle: "Biometric authentication isn't available on this device.",
        btnText: 'Enter PIN',
        showRetry: false,
        isUnavailable: true,
        pulseIcon: false,
      });
      if (els.views.biometric) els.views.biometric.style.display = 'block';
      break;

    case 'PIN_REQUIRED':
    case 'PIN_VERIFYING':
    case 'PIN_FAILED':
      renderPinView();
      if (els.views.pin) els.views.pin.style.display = 'block';
      break;

    case 'LOCKED_OUT':
      if (els.views.lockout) els.views.lockout.style.display = 'block';
      break;
  }
}

/**
 * Render Biometric View labels and buttons.
 */
function renderBiometricView({ title, subtitle, btnText, showRetry, isUnavailable, pulseIcon }) {
  if (els.biometric.title) els.biometric.title.textContent = title;
  if (els.biometric.subtitle) els.biometric.subtitle.textContent = subtitle;
  if (els.biometric.actionBtn) {
    els.biometric.actionBtn.textContent = btnText;
    els.biometric.actionBtn.style.display = isUnavailable ? 'none' : 'flex';
  }
  if (els.biometric.fallbackBtn) {
    els.biometric.fallbackBtn.textContent = isUnavailable ? 'Enter PIN' : 'Use PIN instead';
  }
  if (els.biometric.icon) {
    if (pulseIcon) {
      els.biometric.icon.classList.add('bio-icon--pulse');
    } else {
      els.biometric.icon.classList.remove('bio-icon--pulse');
    }
  }
}

/**
 * Render PIN View subtitle and attempts remaining.
 */
function renderPinView() {
  if (els.pin.title) els.pin.title.textContent = 'Enter PIN';
  if (els.pin.subtitle) {
    els.pin.subtitle.textContent = `Enter your 4-digit PIN to ${getActionVerb(currentAction)}.`;
  }
  updateAttemptsDisplay();
}

/**
 * Get readable action description for sheet subtitle.
 */
function getActionDescription(action) {
  switch (action) {
    case 'ARM':
      return 'Use biometric authentication to turn ON security.';
    case 'DISARM':
      return 'Use biometric authentication to turn OFF security.';
    case 'ALARM_CLEAR':
      return 'Use biometric authentication to turn OFF active alarm.';
    default:
      return 'Use biometric authentication to continue.';
  }
}

function getActionVerb(action) {
  switch (action) {
    case 'ARM': return 'turn ON security';
    case 'DISARM': return 'turn OFF security';
    case 'ALARM_CLEAR': return 'turn OFF alarm';
    default: return 'continue';
  }
}

// ==============================================================
// BIOMETRIC & WEBAUTHN FLOW
// ==============================================================

/**
 * Handle tap on "Use Biometric" / "Try Again".
 */
function handleBiometricClick() {
  triggerBiometricVerification();
}

/**
 * Execute Biometric Verification (WebAuthn or Mock).
 */
async function triggerBiometricVerification() {
  if (isVerifying) return;
  isVerifying = true;

  try {
    let result;

    if (CONFIG.AUTH_MOCK_MODE) {
      // Mock biometric verification
      result = await API.mockBiometricVerify(currentAction, true);
    } else if (WebAuthn.isWebAuthnSupported()) {
      try {
        const authStatus = await API.getAuthStatus().catch(() => ({ hasPasskeys: false }));

        if (!authStatus.hasPasskeys) {
          // First time on this device: prompt native Face ID / Touch ID registration
          console.log('[WebAuthn] First time on device, creating passkey...');
          await WebAuthn.registerPasskey();
          setState({ hasPasskeys: true });
          result = await WebAuthn.authenticatePasskey(currentAction);
        } else {
          result = await WebAuthn.authenticatePasskey(currentAction);
        }
      } catch (webAuthnErr) {
        console.warn('[WebAuthn] Biometric error:', webAuthnErr);
        isVerifying = false;

        if (webAuthnErr.name === 'NotAllowedError') {
          // User clicked cancel on native Face ID prompt
          switchView('BIOMETRIC_FAILED', 'Biometric prompt was cancelled.');
          return;
        }

        // Other WebAuthn error -> fallback to PIN immediately
        switchView('PIN_REQUIRED');
        return;
      }
    } else {
      switchView('BIOMETRIC_UNAVAILABLE');
      isVerifying = false;
      return;
    }

    if (result && result.authToken) {
      onAuthSuccess(result.authToken);
    } else {
      switchView('BIOMETRIC_FAILED', 'Biometric verification failed.');
    }
  } catch (err) {
    console.error('[Auth] Biometric verification error:', err);
    switchView('BIOMETRIC_FAILED', err.message || 'Biometric verification failed.');
  } finally {
    isVerifying = false;
  }
}

// ==============================================================
// PIN KEYPAD FLOW & SERVER-ENFORCED LOCKOUT
// ==============================================================

/**
 * Handle numeric keypad press.
 */
function handlePinKeypadPress(key) {
  if (isVerifying || getState().authFlowState === 'LOCKED_OUT') return;

  if (key >= '0' && key <= '9') {
    if (pinDigits.length < 4) {
      pinDigits.push(key);
      updatePinDots();
      hidePinError();

      if (pinDigits.length === 4) {
        setTimeout(submitPin, CONFIG.PIN_VERIFY_DELAY);
      }
    }
  } else if (key === 'backspace') {
    if (pinDigits.length > 0) {
      pinDigits.pop();
      updatePinDots();
      hidePinError();
    }
  }
}

/**
 * Handle physical keyboard input.
 */
function handleKeyboardInput(e) {
  const state = getState();
  if (!state.authSheetOpen) return;

  if (e.key === 'Escape') {
    closeAuthSheet();
    return;
  }

  if (state.authFlowState === 'PIN_REQUIRED' || state.authFlowState === 'PIN_FAILED') {
    if (e.key >= '0' && e.key <= '9') {
      handlePinKeypadPress(e.key);
    } else if (e.key === 'Backspace') {
      handlePinKeypadPress('backspace');
    }
  }
}

/**
 * Submit PIN for server verification.
 */
async function submitPin() {
  if (isVerifying) return;
  isVerifying = true;
  setState({ authFlowState: 'PIN_VERIFYING' });

  const enteredPin = pinDigits.join('');

  try {
    const result = await API.verifyPin(enteredPin, currentAction);

    if (result.success && result.authToken) {
      onAuthSuccess(result.authToken);
    } else {
      onPinFailed(result);
    }
  } catch (err) {
    // Check if error response has lockout or attempt details
    onPinFailed(err);
  } finally {
    isVerifying = false;
  }
}

/**
 * Handle PIN Failure.
 */
function onPinFailed(err) {
  const isLockedOut = err.lockedOut || (err.data && err.data.lockedOut);
  const remainingSeconds = err.remainingSeconds || (err.data && err.data.remainingSeconds) || 0;
  const attemptsRemaining = err.attemptsRemaining ?? (err.data && err.data.attemptsRemaining) ?? 0;

  setState({
    authFlowState: isLockedOut ? 'LOCKED_OUT' : 'PIN_FAILED',
    authAttemptsRemaining: attemptsRemaining,
  });

  // Shake animation
  els.pin.dotsContainer?.classList.add('pin-dots--shake');
  els.pin.dots?.forEach((dot) => {
    dot.classList.remove('pin-dot--filled');
    dot.classList.add('pin-dot--error');
  });

  setTimeout(() => {
    els.pin.dotsContainer?.classList.remove('pin-dots--shake');
    els.pin.dots?.forEach((dot) => dot.classList.remove('pin-dot--error'));
    pinDigits = [];
    updatePinDots();

    if (isLockedOut) {
      startLockoutCountdown(remainingSeconds);
    } else {
      showPinError(err.error || err.message || 'Incorrect PIN.');
      updateAttemptsDisplay(attemptsRemaining);
    }
  }, 600);
}

/**
 * Update visual dots for entered PIN.
 */
function updatePinDots() {
  els.pin.dots?.forEach((dot, i) => {
    if (i < pinDigits.length) {
      dot.classList.add('pin-dot--filled');
    } else {
      dot.classList.remove('pin-dot--filled');
    }
    dot.classList.remove('pin-dot--error');
  });
}

/**
 * Show error message below PIN dots.
 */
function showPinError(msg) {
  if (els.pin.errorText) {
    els.pin.errorText.textContent = msg;
    els.pin.errorText.classList.add('pin-error--visible');
  }
}

/**
 * Hide error message below PIN dots.
 */
function hidePinError() {
  if (els.pin.errorText) {
    els.pin.errorText.classList.remove('pin-error--visible');
  }
}

/**
 * Update remaining attempts display.
 */
function updateAttemptsDisplay(attempts = null) {
  if (!els.pin.attemptsText) return;
  const count = attempts !== null ? attempts : getState().authAttemptsRemaining;
  if (count < 5 && count > 0) {
    els.pin.attemptsText.textContent = `${count} attempt${count === 1 ? '' : 's'} remaining`;
    els.pin.attemptsText.style.display = 'block';
  } else {
    els.pin.attemptsText.style.display = 'none';
  }
}

/**
 * Start Countdown Timer for Server Lockout.
 */
export function startLockoutCountdown(seconds) {
  if (lockoutTimerId) clearInterval(lockoutTimerId);

  currentRemainingSeconds = seconds || 30;
  setState({
    authFlowState: 'LOCKED_OUT',
    authLockoutSeconds: currentRemainingSeconds,
  });

  switchView('LOCKED_OUT');
  updateLockoutDisplay(currentRemainingSeconds);

  lockoutTimerId = setInterval(() => {
    currentRemainingSeconds -= 1;
    setState({ authLockoutSeconds: currentRemainingSeconds });
    updateLockoutDisplay(currentRemainingSeconds);

    if (currentRemainingSeconds <= 0) {
      clearInterval(lockoutTimerId);
      lockoutTimerId = null;
      setState({
        authFlowState: 'PIN_REQUIRED',
        authAttemptsRemaining: 5,
        authLockoutSeconds: 0,
      });
      switchView('PIN_REQUIRED');
      hidePinError();
    }
  }, 1000);
}

function updateLockoutDisplay(seconds) {
  if (els.lockout.countdown) {
    els.lockout.countdown.textContent = `Try again in ${seconds}s`;
  }
}

// ==============================================================
// SUCCESS & ACTION EXECUTION
// ==============================================================

/**
 * Handle successful authentication (Biometric or PIN).
 * @param {string} authToken - Single-use token to authorize ARM/DISARM
 */
function onAuthSuccess(authToken) {
  const actionToExecute = currentAction;
  isVerifying = false;

  // Reset lockout countdown if any
  if (lockoutTimerId) {
    clearInterval(lockoutTimerId);
    lockoutTimerId = null;
  }

  // Slide down auth sheet immediately
  closeAuthSheet();

  // Show "Authorization successful" overlay
  if (els.overlay) {
    els.overlay.classList.add('success-overlay--visible');
  }

  setTimeout(() => {
    if (els.overlay) {
      els.overlay.classList.remove('success-overlay--visible');
    }

    // Execute security command with single-use authToken
    executeSecurityCommand(actionToExecute, authToken);
  }, CONFIG.SUCCESS_DISPLAY_TIME);
}

/**
 * Execute ARM, DISARM, or ALARM_CLEAR with the single-use authorization token.
 * Shows pending status and waits for device confirmation via WebSocket.
 */
async function executeSecurityCommand(action, authToken) {
  // Prevent duplicate clicks
  setState({
    isActionPending: true,
    pendingStatusMessage: getPendingStatusText(action),
  });

  // Start confirmation timeout guard (8s)
  if (commandTimeoutId) clearTimeout(commandTimeoutId);
  commandTimeoutId = setTimeout(() => {
    const currentState = getState();
    if (currentState.isActionPending) {
      console.warn('[Security] Device did not respond within timeout.');
      setState({
        isActionPending: false,
        pendingStatusMessage: null,
      });
      showTemporaryToast('Device did not respond. Verify connection.');
    }
  }, CONFIG.COMMAND_TIMEOUT_MS);

  try {
    const deviceId = getState().deviceId || CONFIG.DEVICE_ID;

    switch (action) {
      case 'ARM':
        await API.armDevice(deviceId, { authToken });
        break;
      case 'DISARM':
        await API.disarmDevice(deviceId, { authToken });
        break;
      case 'ALARM_CLEAR':
        await API.clearAlarm(deviceId, { authToken });
        break;
    }

    console.log(`[Security] Command ${action} published successfully via backend MQTT.`);
  } catch (err) {
    console.error(`[Security] Command ${action} failed:`, err.message);
    if (commandTimeoutId) clearTimeout(commandTimeoutId);
    setState({
      isActionPending: false,
      pendingStatusMessage: null,
    });
    showTemporaryToast(`Failed: ${err.message}`);
  }
}

/**
 * Status message while awaiting device confirmation.
 */
function getPendingStatusText(action) {
  switch (action) {
    case 'ARM':
      return 'Activating security...';
    case 'DISARM':
      return 'Disarming...';
    case 'ALARM_CLEAR':
      return 'Clearing alarm...';
    default:
      return 'Processing...';
  }
}

/**
 * Device state change listener to complete pending actions on confirmation.
 */
function onDeviceStateChanged(newState, prevState) {
  if (!newState.isActionPending) return;

  // Check if expected state confirmed
  if (newState.securityState !== prevState.securityState || (!newState.alarmActive && prevState.alarmActive)) {
    if (commandTimeoutId) clearTimeout(commandTimeoutId);
    setState({
      isActionPending: false,
      pendingStatusMessage: null,
    });
  }
}

/**
 * Simple toast notification.
 */
function showTemporaryToast(message) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('app-toast--visible');
  setTimeout(() => {
    toast.classList.remove('app-toast--visible');
  }, 3500);
}

// ==============================================================
// PASSKEY REGISTRATION HELPER
// ==============================================================

/**
 * Register a new passkey from UI.
 */
export async function handleRegisterPasskey() {
  try {
    showTemporaryToast('Registering passkey...');
    await WebAuthn.registerPasskey();
    setState({ hasPasskeys: true });
    showTemporaryToast('Passkey registered successfully!');
  } catch (err) {
    console.error('[WebAuthn] Registration error:', err);
    showTemporaryToast(`Passkey registration failed: ${err.message}`);
  }
}

// ==============================================================
// DEV & MOCK UTILITIES
// ==============================================================

/**
 * Simulate Biometric Outcome in Dev Mode.
 * @param {'success' | 'failure' | 'unavailable' | 'lockout'} outcome
 */
export function simulateBiometric(outcome) {
  switch (outcome) {
    case 'success':
      if (currentAction) {
        onAuthSuccess('mock-auth-token-' + Date.now());
      } else {
        openAuthSheet('ARM');
        setTimeout(() => onAuthSuccess('mock-auth-token-' + Date.now()), 500);
      }
      break;

    case 'failure':
      switchView('BIOMETRIC_FAILED', 'Biometric verification failed.');
      break;

    case 'unavailable':
      switchView('BIOMETRIC_UNAVAILABLE');
      break;

    case 'lockout':
      startLockoutCountdown(30);
      break;
  }
}
