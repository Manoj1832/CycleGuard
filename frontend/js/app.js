/**
 * CycleGuard — App Entry Point
 * Initializes all modules, navigation, and reactive state.
 * Strictly aligned with Reference Design System.
 */

import CONFIG from './config.js';
import { getState, setState, subscribe } from './state.js';
import { initUI } from './ui.js';
import { initAuth, simulateBiometric, handleRegisterPasskey } from './auth.js';
import { connectWebSocket } from './websocket.js';
import { startAlarm, stopAlarm, playChirp, initAudioUnlock } from './audio.js';
import { initJournal, loadJournal } from './journal.js';
import { initCoach, loadCoachRecommendations } from './coach.js';
import * as Icons from './icons.js';

let currentTab = 'home';

/**
 * Boot the application.
 */
function init() {
  console.log('[CycleGuard] Initializing redesign...');
  console.log('[CycleGuard] Mock mode:', CONFIG.MOCK_MODE);
  console.log('[CycleGuard] Auth Mock mode:', CONFIG.AUTH_MOCK_MODE);

  // Initialize Web Audio unlock
  initAudioUnlock();

  // Initialize UI renderer
  initUI();

  // Initialize Authentication module (WebAuthn + PIN fallback)
  initAuth();

  // Connect WebSocket (mock mode will skip actual connection)
  connectWebSocket();

  // Set up audio alarm listener on security state
  let prevAlarm = false;
  let prevSecurity = null;
  subscribe((state) => {
    const isAlarm = state.securityState === 'ALARM' || state.alarmActive === true;

    if (isAlarm && !prevAlarm) {
      startAlarm();
    } else if (!isAlarm && prevAlarm) {
      stopAlarm();
    }
    prevAlarm = isAlarm;

    if (prevSecurity !== null && state.securityState !== prevSecurity && !isAlarm) {
      if (state.securityState === 'ON') playChirp('ARM');
      else if (state.securityState === 'OFF') playChirp('DISARM');
    }
    prevSecurity = state.securityState;
  });

  // Initialize Activity Journal & Security Coach
  initJournal();
  initCoach();

  // Initialize 4-Screen Navigation
  initNavigation();

  // Set up settings button & avatar
  initSettingsButton();

  // Set up dev panel (keyboard shortcut Ctrl+Shift+D)
  initDevPanel();

  console.log('[CycleGuard] Ready');
}

/**
 * 4-Destination Navigation (Home, Device, Journal, Coach).
 */
function initNavigation() {
  const tabs = document.querySelectorAll('.tab-nav__item');
  const headerBtn = document.getElementById('header-action-btn');
  const headerTitle = document.getElementById('header-title');
  const headerSubtitle = document.getElementById('header-subtitle');
  const deviceDetailBtn = document.getElementById('btn-device-details');

  const screens = {
    home: document.getElementById('screen-home'),
    device: document.getElementById('screen-device'),
    journal: document.getElementById('screen-journal'),
    coach: document.getElementById('screen-coach'),
  };

  function switchTab(tabId) {
    currentTab = tabId;

    // Update bottom tab buttons active state
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tab === tabId;
      tab.classList.toggle('tab-nav__item--active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    // Toggle screen displays
    Object.keys(screens).forEach((key) => {
      if (screens[key]) {
        screens[key].style.display = key === tabId ? 'flex' : 'none';
      }
    });

    // Update Header based on destination
    if (tabId === 'home') {
      if (headerBtn) headerBtn.innerHTML = Icons.grid;
      if (headerTitle) headerTitle.textContent = 'Hello, Manoj!';
      if (headerSubtitle) headerSubtitle.textContent = 'Bicycle Security System';
    } else if (tabId === 'device') {
      if (headerBtn) headerBtn.innerHTML = Icons.chevronLeft;
      if (headerTitle) headerTitle.textContent = 'Device Security';
      if (headerSubtitle) headerSubtitle.textContent = 'Live Security Status';
    } else if (tabId === 'journal') {
      if (headerBtn) headerBtn.innerHTML = Icons.chevronLeft;
      if (headerTitle) headerTitle.textContent = 'Activity Journal';
      if (headerSubtitle) headerSubtitle.textContent = 'Security Event History';
      loadJournal();
    } else if (tabId === 'coach') {
      if (headerBtn) headerBtn.innerHTML = Icons.chevronLeft;
      if (headerTitle) headerTitle.textContent = 'Security Coach';
      if (headerSubtitle) headerSubtitle.textContent = 'Timetable Intelligence';
      loadCoachRecommendations();
    }

    // Update URL query without full reload
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tabId);
      window.history.replaceState(null, '', url.toString());
    } catch (e) {}

    // Scroll smoothly to top
    const content = document.querySelector('.app-content');
    if (content) content.scrollTop = 0;
  }

  // Bind tab clicks
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Header action button (Back button on secondary screens, grid on home)
  if (headerBtn) {
    headerBtn.addEventListener('click', () => {
      if (currentTab !== 'home') {
        switchTab('home');
      } else {
        openSettingsModal();
      }
    });
  }

  // Device overview card expand button
  if (deviceDetailBtn) {
    deviceDetailBtn.addEventListener('click', () => {
      switchTab('device');
    });
  }

  // Support deep-linking via ?tab= or #hash
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') || window.location.hash.replace('#', '') || 'home';
  if (screens[initialTab]) {
    switchTab(initialTab);
  } else {
    switchTab('home');
  }
}

/**
 * Settings / Passkey registration dialog.
 */
function openSettingsModal() {
  const choice = confirm('CycleGuard Security Settings\n\nWould you like to register a new Passkey / Biometric credential?');
  if (choice) {
    handleRegisterPasskey();
  }
}

function initSettingsButton() {
  const avatar = document.getElementById('header-avatar');
  if (avatar) {
    avatar.addEventListener('click', openSettingsModal);
  }
}

/**
 * Initialize developer panel for mock testing.
 * Toggle with Ctrl+Shift+D (or Cmd+Shift+D on Mac).
 */
function initDevPanel() {
  const panel = document.getElementById('dev-panel');
  if (!panel) return;

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isLocal) {
    panel.remove();
    return;
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      panel.classList.toggle('dev-panel--visible');
    }
  });

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
