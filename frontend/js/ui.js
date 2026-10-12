/**
 * CycleGuard — UI Renderer
 * Reactive UI updates aligned with the Reference Design System.
 */

import { getState, subscribe } from './state.js';
import { openAuthSheet, showTemporaryToast } from './auth.js';
import * as Icons from './icons.js';

// ---- DOM references ----
let els = {};

/**
 * Initialize UI — cache DOM refs and subscribe to state.
 */
export function initUI() {
  els = {
    // Primary circular action
    circularControlRing: document.getElementById('circular-control-ring'),
    actionBtn: document.getElementById('action-btn'),
    actionBtnIcon: document.getElementById('action-btn-icon'),
    actionBtnText: document.getElementById('action-btn-text'),

    // Two-column metrics row
    metricEventsCount: document.getElementById('metric-events-count'),
    metricSystemStatus: document.getElementById('metric-system-status'),

    // Home overview card
    homeDeviceBadge: document.getElementById('home-device-badge'),
    homeDeviceStatusText: document.getElementById('home-device-status-text'),
    homeLastSeen: document.getElementById('home-last-seen'),
    homeVibrationStatus: document.getElementById('home-vibration-status'),
    homeSecurityState: document.getElementById('home-security-state'),
    homeAlarmState: document.getElementById('home-alarm-state'),

    // Device screen telemetry
    deviceTabBadge: document.getElementById('device-tab-badge'),
    deviceTabStatusText: document.getElementById('device-tab-status-text'),
    deviceLiveEvents: document.getElementById('device-live-events'),
    connectionBanner: document.getElementById('connection-banner'),
    connectionBannerText: document.getElementById('connection-banner-text'),

    // Compatibility references
    statusRing: document.getElementById('status-ring'),
    statusIcon: document.getElementById('status-icon'),
    statusLabel: document.getElementById('status-label'),
    statusState: document.getElementById('status-state'),
    statusDescription: document.getElementById('status-description'),
    deviceDot: document.getElementById('device-status-dot'),
    deviceValue: document.getElementById('device-status-value'),
    activityIcon: document.getElementById('activity-icon'),
    activityValue: document.getElementById('activity-value'),
  };

  // Primary circular action button click
  if (els.actionBtn) {
    els.actionBtn.addEventListener('click', handleActionClick);
  }

  // Subscribe to reactive state updates
  subscribe(renderState);

  // Initial render
  renderState(getState(), {});
}

/**
 * Handle primary action button click — opens authentication bottom sheet.
 */
function handleActionClick() {
  const { securityState, connectionState, isActionPending } = getState();

  if (isActionPending) {
    console.warn('[UI] Action already in progress, ignoring click.');
    return;
  }

  // Report device offline if hardware is disconnected
  if (connectionState === 'DISCONNECTED') {
    showTemporaryToast('Device is Offline. Check device power and cloud connection.', true);
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
 */
function renderState(state, prev) {
  renderSecurityState(state);
  renderConnectionState(state);
  renderLastActivity(state);
  renderActionButton(state);
}

/**
 * Render security state across circular control, metrics, and cards.
 */
function renderSecurityState(state) {
  const { securityState } = state;
  const ring = els.circularControlRing;
  const btn = els.actionBtn;
  const metricStatus = els.metricSystemStatus;
  const homeSec = els.homeSecurityState;
  const homeAlarm = els.homeAlarmState;

  if (ring) {
    ring.className = 'circular-control-ring';
  }

  switch (securityState) {
    case 'OFF':
      if (ring) ring.classList.remove('circular-control-ring--armed', 'circular-control-ring--alarm');
      if (metricStatus) {
        metricStatus.textContent = 'Disarmed';
        metricStatus.style.color = 'var(--text-primary)';
      }
      if (homeSec) homeSec.textContent = 'OFF';
      if (homeAlarm) homeAlarm.textContent = 'Silent';
      break;

    case 'ON':
      if (ring) ring.classList.add('circular-control-ring--armed');
      if (metricStatus) {
        metricStatus.textContent = 'Armed';
        metricStatus.style.color = '#16A34A';
      }
      if (homeSec) homeSec.textContent = 'ARMED';
      if (homeAlarm) homeAlarm.textContent = 'Silent';
      break;

    case 'ALARM':
      if (ring) ring.classList.add('circular-control-ring--alarm');
      if (metricStatus) {
        metricStatus.textContent = 'ALARM ACTIVE';
        metricStatus.style.color = '#DC2626';
      }
      if (homeSec) homeSec.textContent = 'ALARM';
      if (homeAlarm) homeAlarm.textContent = 'ACTIVE SIREN';
      break;
  }
}

/**
 * Render connection / hardware online status.
 */
function renderConnectionState(state) {
  const { connectionState } = state;
  const badge = els.homeDeviceBadge;
  const statusText = els.homeDeviceStatusText;
  const devBadge = els.deviceTabBadge;
  const devStatusText = els.deviceTabStatusText;
  const banner = els.connectionBanner;

  if (badge) badge.className = 'status-badge';
  if (devBadge) devBadge.className = 'status-badge';

  switch (connectionState) {
    case 'CONNECTED':
      if (badge) {
        badge.classList.add('status-badge--online');
        if (statusText) statusText.textContent = 'Connected';
      }
      if (devBadge) {
        devBadge.classList.add('status-badge--online');
        if (devStatusText) devStatusText.textContent = 'Online';
      }
      if (banner) banner.classList.remove('connection-banner--visible');
      break;

    case 'DISCONNECTED':
      if (badge) {
        badge.classList.add('status-badge--offline');
        if (statusText) statusText.textContent = 'Offline';
      }
      if (devBadge) {
        devBadge.classList.add('status-badge--offline');
        if (devStatusText) devStatusText.textContent = 'Offline';
      }
      if (banner) {
        banner.className = 'connection-banner connection-banner--offline connection-banner--visible';
        if (els.connectionBannerText) {
          els.connectionBannerText.textContent = 'Device is Offline — Unit disconnected';
        }
      }
      if (els.homeVibrationStatus) {
        els.homeVibrationStatus.textContent = 'Offline (No Link)';
        els.homeVibrationStatus.style.color = 'var(--text-secondary)';
      }
      break;

    case 'CONNECTING':
      if (badge) {
        badge.classList.add('status-badge--alarm');
        if (statusText) statusText.textContent = 'Connecting...';
      }
      if (devBadge) {
        devBadge.classList.add('status-badge--alarm');
        if (devStatusText) devStatusText.textContent = 'Connecting...';
      }
      if (banner) banner.classList.add('connection-banner--visible');
      break;
  }
}

/**
 * Render last activity info and live event feed.
 */
function renderLastActivity(state) {
  const { lastActivity, securityState } = state;
  const homeLast = els.homeLastSeen;
  const homeVib = els.homeVibrationStatus;
  const liveEvents = els.deviceLiveEvents;

  if (lastActivity && homeLast) {
    homeLast.textContent = lastActivity.message || 'Movement detected';
  }

  if (securityState === 'ALARM' && homeVib) {
    homeVib.textContent = 'ALERT TRIGGERED';
    homeVib.style.color = '#DC2626';
  } else if (homeVib) {
    homeVib.textContent = 'Monitoring';
    homeVib.style.color = 'var(--text-primary)';
  }

  // Prepend to live events stream if active
  if (liveEvents && lastActivity) {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'history-row';
    row.innerHTML = `
      <span class="history-row__date">LIVE</span>
      <span class="history-row__desc">${escapeHtml(lastActivity.message || 'Vibration detected')}</span>
      <span class="history-row__time">${timeStr}</span>
      <span class="history-row__source source-badge--real">LIVE</span>
    `;
    // Insert after header
    if (liveEvents.children.length > 5) {
      liveEvents.removeChild(liveEvents.lastElementChild);
    }
    liveEvents.prepend(row);
  }
}

/**
 * Render circular control button text and icon.
 */
function renderActionButton(state) {
  const { securityState, isActionPending, pendingStatusMessage } = state;
  const btn = els.actionBtn;
  const ring = els.circularControlRing;
  const icon = els.actionBtnIcon;
  const text = els.actionBtnText;

  if (!btn || !text || !icon) return;

  if (isActionPending) {
    btn.disabled = true;
    if (ring) ring.classList.add('circular-control-ring--pending');
    text.textContent = pendingStatusMessage || 'CONFIRMING...';
    return;
  }

  btn.disabled = false;
  btn.className = 'circular-control-btn';

  switch (securityState) {
    case 'OFF':
      icon.innerHTML = Icons.lock;
      text.textContent = 'ARM SECURITY';
      break;

    case 'ON':
      btn.classList.add('circular-control-btn--armed');
      icon.innerHTML = Icons.shieldCheck;
      text.textContent = 'DISARM SECURITY';
      break;

    case 'ALARM':
      btn.classList.add('circular-control-btn--alarm');
      icon.innerHTML = Icons.triangleAlert;
      text.textContent = 'CLEAR ALARM';
      break;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
