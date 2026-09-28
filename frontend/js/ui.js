/**
 * CycleGuard — UI Renderer
 * Reactive UI updates based on state changes.
 * All DOM manipulations happen here.
 */

import { getState, subscribe } from './state.js';
import { openAuthSheet } from './auth.js';
import * as Icons from './icons.js';

// ---- DOM references ----
let els = {};

/**
 * Initialize UI — cache DOM refs and subscribe to state.
 */
export function initUI() {
  els = {
    statusRing: document.getElementById('status-ring'),
    statusIcon: document.getElementById('status-icon'),
    statusLabel: document.getElementById('status-label'),
    statusState: document.getElementById('status-state'),
    statusDescription: document.getElementById('status-description'),
    deviceDot: document.getElementById('device-status-dot'),
    deviceValue: document.getElementById('device-status-value'),
    activityIcon: document.getElementById('activity-icon'),
    activityValue: document.getElementById('activity-value'),
    actionBtn: document.getElementById('action-btn'),
    actionBtnIcon: document.getElementById('action-btn-icon'),
    actionBtnText: document.getElementById('action-btn-text'),
    connectionBanner: document.getElementById('connection-banner'),
    bicycleVisual: document.getElementById('bicycle-visual'),
  };

  // Primary button click
  els.actionBtn.addEventListener('click', handleActionClick);

  // Subscribe to state
  subscribe(renderState);

  // Initial render
  renderState(getState(), {});
}

/**
 * Handle primary action button click — opens authentication bottom sheet.
 * Prevents duplicate clicks while an action is already in progress.
 */
function handleActionClick() {
  const { securityState, isActionPending } = getState();

  if (isActionPending) {
    console.warn('[UI] Action already in progress, ignoring click.');
    return;
  }

  // Determine security action
  let action;
  if (securityState === 'ALARM') {
    action = 'ALARM_CLEAR';
  } else if (securityState === 'ON') {
    action = 'DISARM';
  } else {
    action = 'ARM';
  }

  openAuthSheet(action);
}

/**
 * Render UI based on current state.
 * @param {object} state
 * @param {object} prev
 */
function renderState(state, prev) {
  renderSecurityState(state);
  renderConnectionState(state);
  renderLastActivity(state);
  renderActionButton(state);
}

/**
 * Render security state (ring, icon, text).
 */
function renderSecurityState(state) {
  const { securityState } = state;

  // Update CSS custom properties for state color
  const root = document.documentElement;
  let stateColor, stateBg, stateBgStrong;

  // Clean up alarm class
  els.statusRing.classList.remove('status-ring--alarm');

  switch (securityState) {
    case 'OFF':
      stateColor = 'var(--danger)';
      stateBg = 'var(--danger-bg)';
      stateBgStrong = 'var(--danger-bg-strong)';
      els.statusIcon.innerHTML = Icons.lockOpen;
      els.statusLabel.textContent = 'Security';
      els.statusState.textContent = 'OFF';
      els.statusDescription.textContent = 'Your bicycle is not being monitored';
      break;

    case 'ON':
      stateColor = 'var(--success)';
      stateBg = 'var(--success-bg)';
      stateBgStrong = 'var(--success-bg-strong)';
      els.statusIcon.innerHTML = Icons.shieldCheck;
      els.statusLabel.textContent = 'Security';
      els.statusState.textContent = 'ON';
      els.statusDescription.textContent = 'Your bicycle is protected';
      break;

    case 'ALARM':
      stateColor = 'var(--danger)';
      stateBg = 'var(--danger-bg)';
      stateBgStrong = 'var(--danger-bg-strong)';
      els.statusIcon.innerHTML = Icons.triangleAlert;
      els.statusLabel.textContent = 'ALARM';
      els.statusState.textContent = 'ACTIVE';
      els.statusDescription.textContent = 'Movement detected! Buzzer active.';
      els.statusRing.classList.add('status-ring--alarm');
      break;
  }

  root.style.setProperty('--state-color', stateColor);
  root.style.setProperty('--state-bg', stateBg);
  root.style.setProperty('--state-bg-strong', stateBgStrong);
}

/**
 * Render connection/device status.
 */
function renderConnectionState(state) {
  const { connectionState } = state;
  const dot = els.deviceDot;
  const value = els.deviceValue;
  const banner = els.connectionBanner;

  // Reset dot classes
  dot.className = 'info-card__status-dot';

  switch (connectionState) {
    case 'CONNECTED':
      dot.classList.add('info-card__status-dot--connected');
      value.textContent = 'Connected';
      banner.classList.remove('connection-banner--visible');
      break;

    case 'DISCONNECTED':
      dot.classList.add('info-card__status-dot--disconnected');
      value.textContent = 'Device Offline';
      banner.classList.remove('connection-banner--visible');
      break;

    case 'CONNECTING':
      dot.classList.add('info-card__status-dot--connecting');
      value.textContent = 'Connecting...';
      banner.classList.add('connection-banner--visible');
      break;
  }
}

/**
 * Render last activity info.
 */
function renderLastActivity(state) {
  const { lastActivity, securityState } = state;

  if (securityState === 'ALARM' && lastActivity) {
    els.activityIcon.className = 'info-card__icon info-card__icon--alert';
    els.activityValue.textContent = lastActivity.message || 'Movement detected';
  } else if (lastActivity) {
    els.activityIcon.className = 'info-card__icon info-card__icon--activity';
    els.activityValue.textContent = lastActivity.message || 'No movement detected';
  } else {
    els.activityIcon.className = 'info-card__icon info-card__icon--activity';
    els.activityValue.textContent = 'No movement detected';
  }
}

/**
 * Render primary action button.
 */
function renderActionButton(state) {
  const { securityState, isActionPending, pendingStatusMessage } = state;
  const btn = els.actionBtn;

  // If waiting for device confirmation from MQTT
  if (isActionPending) {
    btn.disabled = true;
    btn.classList.add('btn-primary--loading');
    els.actionBtnText.textContent = pendingStatusMessage || 'Processing...';
    return;
  }

  btn.disabled = false;
  btn.className = 'btn-primary';

  switch (securityState) {
    case 'OFF':
      btn.classList.add('btn-primary--arm');
      els.actionBtnIcon.innerHTML = Icons.lock;
      els.actionBtnText.textContent = 'Turn ON Security';
      break;

    case 'ON':
      btn.classList.add('btn-primary--disarm');
      els.actionBtnIcon.innerHTML = Icons.lockOpen;
      els.actionBtnText.textContent = 'Turn OFF Security';
      break;

    case 'ALARM':
      btn.classList.add('btn-primary--alarm');
      els.actionBtnIcon.innerHTML = Icons.bellOff;
      els.actionBtnText.textContent = 'Turn OFF Alarm';
      break;
  }
}
