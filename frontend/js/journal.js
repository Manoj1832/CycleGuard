/**
 * CycleGuard — Activity Journal Module
 * Fetches events, renders 2x2 metric grid and compact history rows.
 * Aligned with Screen C of Reference Design.
 */

import CONFIG from './config.js';
import { getEvents, getJournalSummary, confirmParking } from './api.js';

// ---- State ----
let journalState = {
  events: [],
  summary: null,
  loading: false,
  error: null,
  currentDate: new Date().toISOString().split('T')[0],
  sourceFilter: 'all', // 'all' | 'real' | 'user_confirmed' | 'mock'
  typeFilter: null,
};

const SOURCE_LABELS = {
  real: { text: 'REAL', class: 'source-badge--real' },
  mock: { text: 'MOCK', class: 'source-badge--mock' },
  user_confirmed: { text: 'USER', class: 'source-badge--confirmed' },
};

/**
 * Initialize Activity Journal — call after DOM is ready.
 */
export function initJournal() {
  setupFilterListeners();
  loadJournal();
}

/**
 * Load journal data (summary + events).
 */
export async function loadJournal() {
  const container = document.getElementById('journal-events-list');
  const summaryEl = document.getElementById('journal-summary-grid');
  if (!container) return;

  journalState.loading = true;
  renderLoadingState(container);

  try {
    const [summaryData, eventsData] = await Promise.all([
      getJournalSummary(CONFIG.DEVICE_ID, journalState.currentDate),
      getEvents(CONFIG.DEVICE_ID, {
        source: journalState.sourceFilter !== 'all' ? journalState.sourceFilter : undefined,
        type: journalState.typeFilter || undefined,
        limit: 50,
      }),
    ]);

    journalState.summary = summaryData;
    journalState.events = eventsData.events || [];
    journalState.loading = false;
    journalState.error = null;

    renderSummary(summaryEl, summaryData);
    renderEventList(container, journalState.events);
    renderDemoBanner(eventsData.demoModeActive);
  } catch (err) {
    journalState.loading = false;
    journalState.error = err.message;
    renderErrorState(container, err.message);
  }
}

/**
 * Handle parking confirmation quick action.
 */
export async function handleConfirmParking() {
  const btn = document.getElementById('confirm-parking-btn');
  if (!btn) return;

  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML = '<svg class="spin-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Confirming...</span>';

  try {
    await confirmParking(CONFIG.DEVICE_ID);
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Parking Confirmed</span>';
    btn.classList.add('parking-btn--confirmed');
    // Reload journal after 500ms
    setTimeout(() => {
      loadJournal();
      btn.innerHTML = originalText;
      btn.disabled = false;
      btn.classList.remove('parking-btn--confirmed');
    }, 2500);
  } catch (err) {
    btn.innerHTML = originalText;
    btn.disabled = false;
    console.error('[Journal] Parking confirmation failed:', err.message);
  }
}

// ---- Filter Listeners ----

function setupFilterListeners() {
  // Toggle filter bar
  const filterToggleBtn = document.getElementById('btn-filter-toggle');
  const filterContainer = document.getElementById('filter-bar-container');
  if (filterToggleBtn && filterContainer) {
    filterToggleBtn.addEventListener('click', () => {
      const isVisible = filterContainer.style.display !== 'none';
      filterContainer.style.display = isVisible ? 'none' : 'block';
    });
  }

  // Source filter chips
  document.querySelectorAll('[data-source-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-source-filter]').forEach((c) => c.classList.remove('filter-chip--active'));
      chip.classList.add('filter-chip--active');
      journalState.sourceFilter = chip.dataset.sourceFilter;
      loadJournal();
    });
  });

  // Date picker
  const datePicker = document.getElementById('journal-date-picker');
  if (datePicker) {
    datePicker.value = journalState.currentDate;
    datePicker.addEventListener('change', (e) => {
      journalState.currentDate = e.target.value;
      loadJournal();
    });
  }

  // Parking button
  const parkBtn = document.getElementById('confirm-parking-btn');
  if (parkBtn) {
    parkBtn.addEventListener('click', handleConfirmParking);
  }
}

// ---- Render Functions ----

function renderSummary(el, data) {
  const s = (data && data.summary) || {};

  const totalEl = document.getElementById('journal-total-events');
  const armedEl = document.getElementById('journal-armed-count');
  const moveEl = document.getElementById('journal-movement-count');
  const alarmEl = document.getElementById('journal-alarm-count');
  const homeMetricCount = document.getElementById('metric-events-count');

  const totalEvents = s.totalEventsToday || 0;
  const movementEvents = s.movementCount || 0;

  if (totalEl) totalEl.textContent = String(totalEvents).padStart(2, '0');
  if (armedEl) armedEl.textContent = String(s.armedCount || 0).padStart(2, '0');
  if (moveEl) moveEl.textContent = String(movementEvents).padStart(2, '0');
  if (alarmEl) alarmEl.textContent = String(s.alarmCount || 0).padStart(2, '0');

  // Update home dashboard metric
  if (homeMetricCount) {
    homeMetricCount.textContent = String(totalEvents);
  }
}

function renderEventList(container, events) {
  if (!container) return;

  if (!events || events.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 32px 16px;">
        <p style="font-size: var(--text-base); font-weight: 600; color: var(--text-primary); margin: 0 0 4px;">No events recorded</p>
        <span style="font-size: 11px; color: var(--text-secondary);">Events will appear here as your device detects activity.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = events.map((evt) => {
    const sourceInfo = SOURCE_LABELS[evt.source] || SOURCE_LABELS.real;
    const formattedDate = formatDateShort(evt.occurredAt);
    const formattedTime = formatTimeOnly(evt.occurredAt);
    const typeLabel = formatEventType(evt.type);

    return `
      <div class="history-row" data-event-id="${evt.eventId}">
        <span class="history-row__date">${formattedDate}</span>
        <span class="history-row__desc" title="${escapeHtml(evt.message || typeLabel)}">${escapeHtml(typeLabel)}</span>
        <span class="history-row__time">${formattedTime}</span>
        <span class="history-row__source ${sourceInfo.class}">${sourceInfo.text}</span>
      </div>
    `;
  }).join('');
}

function renderLoadingState(container) {
  if (!container) return;
  container.innerHTML = `
    <div style="text-align: center; padding: 24px; color: var(--text-secondary); font-size: 12px;">
      Loading history...
    </div>
  `;
}

function renderErrorState(container, message) {
  if (!container) return;
  container.innerHTML = `
    <div class="card" style="text-align: center; padding: 24px 16px; border-color: var(--status-alarm);">
      <p style="color: var(--danger); font-size: var(--text-sm); font-weight: 600; margin: 0 0 6px;">Failed to load events</p>
      <span style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(message)}</span>
    </div>
  `;
}

function renderDemoBanner(demoActive) {
  const banner = document.getElementById('demo-banner');
  if (banner) {
    banner.style.display = demoActive ? 'flex' : 'none';
  }
}

// ---- Formatting Helpers ----

function formatDateShort(isoStr) {
  try {
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const yr = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${yr}`;
  } catch {
    return '00-00-00';
  }
}

function formatTimeOnly(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

function formatEventType(type) {
  return (type || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
