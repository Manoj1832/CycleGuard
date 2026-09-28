/**
 * CycleGuard — App Entry Point
 * Initializes all modules and sets up the application.
 */

import CONFIG from './config.js';
import { getState, setState, subscribe } from './state.js';
import { initUI } from './ui.js';
import { initAuth, simulateBiometric, handleRegisterPasskey } from './auth.js';
import { connectWebSocket } from './websocket.js';

/**
 * Boot the application.
 */
function init() {
  console.log('[CycleGuard] Initializing...');
  console.log('[CycleGuard] Mock mode:', CONFIG.MOCK_MODE);
  console.log('[CycleGuard] Auth Mock mode:', CONFIG.AUTH_MOCK_MODE);

  // Initialize UI renderer
  initUI();

  // Initialize Authentication module (WebAuthn + PIN fallback)
  initAuth();

  // Connect WebSocket (mock mode will skip actual connection)
  connectWebSocket();

  // Set up settings button
  initSettingsButton();

  // Set up dev panel (keyboard shortcut Ctrl+Shift+D)
  initDevPanel();

  console.log('[CycleGuard] Ready');
}

/**
 * Settings button handler.
 */
function initSettingsButton() {
  const btn = document.getElementById('settings-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const choice = confirm('CycleGuard Security Settings\n\nWould you like to register a new Passkey / Biometric credential?');
    if (choice) {
      handleRegisterPasskey();
    }
  });
}

/**
 * Initialize developer panel for mock testing.
 * Toggle with Ctrl+Shift+D (or Cmd+Shift+D on Mac).
 */
function initDevPanel() {
  const panel = document.getElementById('dev-panel');
  if (!panel) return;

  // Finding F8: Only enable dev panel in local development; strip from production
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isLocal) {
    panel.remove();
    return;
  }

  // Toggle dev panel visibility
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      panel.classList.toggle('dev-panel--visible');
    }
  });

  // Dev panel button handlers
  panel.querySelectorAll('[data-dev-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.devAction;
      handleDevAction(action);
    });
  });
}

/**
 * Handle developer mock actions.
 */
function handleDevAction(action) {
  const now = new Date().toISOString();

  switch (action) {
    case 'connect':
      setState({ connectionState: 'CONNECTED' });
      break;

    case 'disconnect':
      setState({ connectionState: 'DISCONNECTED' });
      break;

    case 'security-on':
      setState({ securityState: 'ON' });
      break;

    case 'security-off':
      setState({ securityState: 'OFF', alarmActive: false });
      break;

    case 'movement':
      setState({
        lastActivity: {
          message: 'Movement detected',
          timestamp: now,
        },
      });
      break;

    case 'alarm':
      setState({
        securityState: 'ALARM',
        alarmActive: true,
        lastActivity: {
          message: 'Movement detected',
          timestamp: now,
        },
      });
      break;

    // WebAuthn & Auth Simulation
    case 'bio-success':
      simulateBiometric('success');
      break;

    case 'bio-failure':
      simulateBiometric('failure');
      break;

    case 'bio-unavailable':
      simulateBiometric('unavailable');
      break;

    case 'bio-lockout':
      simulateBiometric('lockout');
      break;

    case 'register-passkey':
      handleRegisterPasskey();
      break;

    default:
      console.warn('[Dev] Unknown action:', action);
  }
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
