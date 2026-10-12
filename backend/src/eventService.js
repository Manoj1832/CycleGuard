/**
 * CycleGuard Backend — Event Service
 * Authoritative, append-only persistent event history (JSONL).
 * Preserves strict separation between real, mock, and user-confirmed events.
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const DATA_DIR = config.dataDir;
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

// Allowed schema types
const VALID_EVENT_TYPES = new Set([
  'DEVICE_CONNECTED',
  'DEVICE_DISCONNECTED',
  'DEVICE_ARMED',
  'DEVICE_DISARMED',
  'ARM_REQUESTED',
  'DISARM_REQUESTED',
  'MOVEMENT_DETECTED',
  'ALARM_ACTIVATED',
  'PARKING_CONFIRMED',
  'MOCK_ROUTINE_EVENT',
]);

const VALID_SOURCES = new Set(['real', 'mock', 'user_confirmed']);
const VALID_ORIGINS = new Set(['mqtt', 'web', 'system', 'schedule', 'demo']);

class EventService {
  constructor() {
    this.events = [];
    this.lastEventByType = new Map(); // key: `${deviceId}:${type}` -> timestamp
    this.mockEvents = [];
    this.initStorage();
  }

  /**
   * Initialize storage and load existing events from JSONL.
   */
  initStorage() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(EVENTS_FILE)) {
        const lines = fs.readFileSync(EVENTS_FILE, 'utf8').split(/\r?\n/);
        let loaded = 0;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed && parsed.eventId && parsed.type) {
              this.events.push(parsed);
              loaded++;
            }
          } catch (e) {
            console.warn('[EventService] Skipping malformed JSONL line:', e.message);
          }
        }
        console.log(`[EventService] Restored ${loaded} persistent events from ${EVENTS_FILE}`);
      }
    } catch (err) {
      console.error('[EventService] Failed to initialize event storage:', err.message);
    }
  }

  /**
   * Set in-memory mock events (loaded from mock fixtures).
   * Crucial: Mock events are NEVER written to events.jsonl.
   * @param {Array<object>} mockEvents
   */
  setMockEvents(mockEvents) {
    this.mockEvents = Array.isArray(mockEvents) ? mockEvents : [];
  }

  /**
   * Generate a unique event ID.
   */
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Record a new authoritative event.
   * @param {object} param
   * @returns {object} created event
   */
  recordEvent({
    deviceId = config.defaultDeviceId,
    userId = null,
    type,
    source = 'real',
    origin = 'mqtt',
    message,
    details = {},
    occurredAt = null,
  }) {
    if (!VALID_EVENT_TYPES.has(type)) {
      console.warn(`[EventService] Rejected invalid event type: ${type}`);
      return null;
    }

    if (!VALID_SOURCES.has(source)) {
      source = 'real';
    }

    if (!VALID_ORIGINS.has(origin)) {
      origin = 'system';
    }

    // Deduplication check: ignore identical telemetry events if within 2000ms
    const dedupKey = `${deviceId}:${type}`;
    const nowMs = Date.now();
    const lastTimestamp = this.lastEventByType.get(dedupKey);
    if (lastTimestamp && nowMs - lastTimestamp < 2000 && type !== 'MOVEMENT_DETECTED') {
      return null;
    }
    this.lastEventByType.set(dedupKey, nowMs);

    const eventRecord = {
      schemaVersion: 1,
      eventId: this.generateEventId(),
      deviceId: String(deviceId),
      userId: userId ? String(userId) : null,
      type,
      occurredAt: occurredAt || new Date().toISOString(),
      source,
      origin,
      message: message || type.replace(/_/g, ' ').toLowerCase(),
      details: typeof details === 'object' && details !== null ? details : {},
    };

    // If source is mock, keep strictly in-memory
    if (source === 'mock') {
      this.mockEvents.push(eventRecord);
      return eventRecord;
    }

    // Real and user-confirmed events are appended to persistent store
    this.events.push(eventRecord);

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.appendFileSync(EVENTS_FILE, JSON.stringify(eventRecord) + '\n', 'utf8');
    } catch (err) {
      console.error('[EventService] Error appending to events.jsonl:', err.message);
    }

    return eventRecord;
  }

  /**
   * Query events with filters.
   * @param {object} query
   * @returns {{ total: number, events: Array<object> }}
   */
  getEvents({
    deviceId = config.defaultDeviceId,
    from = null,
    to = null,
    type = null,
    source = 'all',
    limit = 50,
    offset = 0,
  }) {
    // Combine real events with mock events only if demo mode is enabled
    let pool = [...this.events];
    const isDemoEnabled = config.demoMode;

    if (isDemoEnabled && (source === 'all' || source === 'mock')) {
      pool = pool.concat(this.mockEvents);
    }

    // Filter by deviceId
    if (deviceId) {
      pool = pool.filter((e) => e.deviceId === String(deviceId));
    }

    // Filter by source
    if (source && source !== 'all') {
      pool = pool.filter((e) => e.source === source);
    } else if (!isDemoEnabled) {
      // In production or when demo mode is off, strictly hide mock events
      pool = pool.filter((e) => e.source !== 'mock');
    }

    // Filter by type
    if (type) {
      pool = pool.filter((e) => e.type === type);
    }

    // Filter by date range
    if (from) {
      const fromTime = new Date(from).getTime();
      if (!isNaN(fromTime)) {
        pool = pool.filter((e) => new Date(e.occurredAt).getTime() >= fromTime);
      }
    }
    if (to) {
      const toTime = new Date(to).getTime();
      if (!isNaN(toTime)) {
        pool = pool.filter((e) => new Date(e.occurredAt).getTime() <= toTime);
      }
    }

    // Sort descending by occurredAt (newest first)
    pool.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    const total = pool.length;
    const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const validOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const paginated = pool.slice(validOffset, validOffset + cappedLimit);

    return {
      total,
      limit: cappedLimit,
      offset: validOffset,
      events: paginated,
    };
  }

  /**
   * Get activity summary for a given day (defaults to today).
   * @param {string} deviceId
   * @param {string} dateStr YYYY-MM-DD
   */
  getJournalSummary(deviceId = config.defaultDeviceId, dateStr = null) {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    const startOfDay = new Date(`${targetDate}T00:00:00.000Z`).getTime();
    const endOfDay = new Date(`${targetDate}T23:59:59.999Z`).getTime();

    const pool = this.getEvents({
      deviceId,
      source: 'all',
      limit: 100,
    }).events;

    const dayEvents = pool.filter((e) => {
      const t = new Date(e.occurredAt).getTime();
      return t >= startOfDay && t <= endOfDay;
    });

    let armedCount = 0;
    let disarmedCount = 0;
    let movementCount = 0;
    let alarmCount = 0;
    let parkingConfirmedCount = 0;

    dayEvents.forEach((e) => {
      if (e.type === 'DEVICE_ARMED') armedCount++;
      if (e.type === 'DEVICE_DISARMED') disarmedCount++;
      if (e.type === 'MOVEMENT_DETECTED') movementCount++;
      if (e.type === 'ALARM_ACTIVATED') alarmCount++;
      if (e.type === 'PARKING_CONFIRMED') parkingConfirmedCount++;
    });

    const latestEvent = pool.length > 0 ? pool[0] : null;

    return {
      date: targetDate,
      deviceId,
      summary: {
        totalEventsToday: dayEvents.length,
        armedCount,
        disarmedCount,
        movementCount,
        alarmCount,
        parkingConfirmedCount,
      },
      latestEvent,
      demoModeActive: !!config.demoMode,
    };
  }
}

module.exports = new EventService();
