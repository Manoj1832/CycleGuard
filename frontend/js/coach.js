/**
 * CycleGuard — Security Coach Module
 * Fetches and displays ML-powered security recommendations in reference card style.
 */

import CONFIG from './config.js';
import { getSecurityCoach } from './api.js';

let coachState = {
  recommendations: [],
  prediction: null,
  scheduleContext: null,
  loading: false,
  error: null,
  engine: 'unknown',
};

let refreshTimer = null;

/**
 * Initialize Security Coach — call after DOM is ready.
 */
export function initCoach() {
  const container = document.getElementById('coach-recommendations');
  if (!container) return;

  loadCoachRecommendations();

  // Auto-refresh every 60 seconds
  refreshTimer = setInterval(loadCoachRecommendations, 60000);
}

/**
 * Fetch and render coach recommendations.
 */
export async function loadCoachRecommendations() {
  const container = document.getElementById('coach-recommendations');
  const scheduleEl = document.getElementById('coach-schedule');
  const engineBadge = document.getElementById('coach-engine-badge');
  if (!container) return;

  coachState.loading = true;

  try {
    const data = await getSecurityCoach(CONFIG.DEVICE_ID);

    coachState.recommendations = data.recommendations || [];
    coachState.prediction = data.prediction || null;
    coachState.scheduleContext = data.scheduleContext || null;
    coachState.engine = data.engine || 'unknown';
    coachState.loading = false;
    coachState.error = null;

    renderRecommendations(container, coachState.recommendations);
    renderScheduleContext(scheduleEl, coachState.scheduleContext);
    renderEngineBadge(engineBadge, coachState.engine, coachState.prediction);
    renderDemoBanner(data.demoModeActive);
  } catch (err) {
    coachState.loading = false;
    coachState.error = err.message;
    renderCoachError(container, err.message);
  }
}

/**
 * Cleanup on destroy.
 */
export function destroyCoach() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// ---- Render Functions ----

function renderRecommendations(container, recommendations) {
  if (!container) return;

  if (!recommendations || recommendations.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 24px 16px; display: flex; flex-direction: column; align-items: center; gap: 8px;">
        <div style="width: 44px; height: 44px; border-radius: 50%; background-color: var(--status-armed); display: flex; align-items: center; justify-content: center; color: #16A34A;" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
        </div>
        <div>
          <p style="font-size: var(--text-base); font-weight: 600; color: var(--text-primary); margin: 0 0 4px;">Security Status Optimal</p>
          <span style="font-size: 11px; color: var(--text-secondary); max-width: 270px; display: inline-block; line-height: 1.4;">No immediate security risk detected. Your bicycle state aligns with your routine schedule.</span>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = recommendations.map((rec) => {
    let recIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`;
    if (rec.severity === 'warning' || rec.type === 'UNSECURED_ON_CAMPUS_RISK') {
      recIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
    } else if (rec.type === 'DEPARTURE_REMINDER') {
      recIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;
    } else if (rec.type === 'RETURN_REMINDER') {
      recIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
    }

    return `
      <div class="coach-rec-card coach-rec-card--${rec.severity}" data-type="${rec.type}">
        <div class="coach-rec-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${recIcon}
            <span class="coach-rec-title">${escapeHtml(rec.title)}</span>
          </div>
          ${rec.confidence < 1 ? `<span class="coach-rec-confidence">${Math.round(rec.confidence * 100)}% Conf.</span>` : ''}
        </div>
        <p class="coach-rec-body">${escapeHtml(rec.message)}</p>
        <div class="coach-rec-footer">
          <span style="display: flex; align-items: center; gap: 4px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Reason: ${escapeHtml(rec.reason)}</span>
          </span>
          <span style="display: flex; align-items: center; gap: 4px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
            <span>Source: ${escapeHtml(rec.dataSource)}</span>
          </span>
        </div>
        <div class="coach-rec-disclaimer">Advisory only — does not control your device hardware.</div>
      </div>
    `;
  }).join('');
}

function renderScheduleContext(el, context) {
  if (!el || !context) {
    if (el) el.innerHTML = '';
    return;
  }

  let html = `<div style="display: flex; flex-direction: column; gap: 8px;">`;

  if (context.currentActivity) {
    html += `
      <div style="background: var(--app-bg); border-radius: var(--radius-sm); padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="display: inline-block; font-size: 9px; font-weight: bold; background: var(--action-bg); color: #fff; padding: 2px 6px; border-radius: 4px; margin-bottom: 2px;">CURRENT CLASS</span>
          <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">${escapeHtml(context.currentActivity.activity)}</div>
          <span style="font-size: 11px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px; margin-top: 2px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${escapeHtml(context.currentActivity.location)}</span>
          </span>
        </div>
        <span style="font-size: 11px; font-family: var(--font-mono); font-weight: 600; color: var(--text-primary);">${context.currentActivity.startTime} – ${context.currentActivity.endTime}</span>
      </div>
    `;
  }

  if (context.nextActivity) {
    html += `
      <div style="background: var(--app-bg); border-radius: var(--radius-sm); padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="display: inline-block; font-size: 9px; font-weight: bold; background: var(--gray-300); color: var(--text-primary); padding: 2px 6px; border-radius: 4px; margin-bottom: 2px;">UPCOMING</span>
          <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">${escapeHtml(context.nextActivity.activity)}</div>
        </div>
        <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-secondary);">${context.nextActivity.startTime} – ${context.nextActivity.endTime}</span>
      </div>
    `;
  }

  if (!context.currentActivity && !context.nextActivity) {
    html += `<div style="text-align: center; font-size: 11px; color: var(--text-secondary); padding: 8px;">No scheduled classes right now</div>`;
  }

  html += `<div style="font-size: 11px; color: var(--text-tertiary); text-align: right; margin-top: 4px;">${context.dayOfWeek} • ${context.totalClassesToday || 0} classes on schedule</div>`;
  html += `</div>`;

  el.innerHTML = html;
}

function renderEngineBadge(el, engine, prediction) {
  if (!el) return;
  const isML = engine && engine.includes('ml');
  const riskScore = prediction ? prediction.riskScore : 0;

  el.innerHTML = `
    <span class="coach-engine-tag" style="background-color: ${isML ? 'var(--action-bg)' : 'var(--gray-300)'}; color: ${isML ? '#fff' : 'var(--text-primary)'};">
      ${isML ? 'Smart Assistant' : 'Security Assistant'}
    </span>
    ${riskScore > 0.5 ? `<span style="font-size: 10px; font-weight: 700; color: #DC2626; margin-left: 4px;">Risk: ${Math.round(riskScore * 100)}%</span>` : ''}
  `;
}

function renderDemoBanner(demoActive) {
  const banner = document.getElementById('demo-banner');
  if (banner) {
    banner.style.display = demoActive ? 'flex' : 'none';
  }
}

function renderCoachError(container, message) {
  if (!container) return;
  container.innerHTML = `
    <div class="card" style="text-align: center; padding: 20px 16px; border-color: var(--status-alarm);">
      <p style="color: var(--danger); font-size: var(--text-sm); font-weight: 600; margin: 0 0 4px;">Could not load recommendations</p>
      <span style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(message)}</span>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
