/**
 * CycleGuard Backend — Mock Data Loader
 * Loads demo fixtures from mock-data/ directory only when DEMO_MODE is active.
 * Guarantees zero pollution of persistent event storage.
 */

const path = require('path');
const config = require('./config');
const { loadCsvFile } = require('./utils/csvParser');
const eventService = require('./eventService');

// Resolve mock-data path relative to workspace
const MOCK_DATA_DIR = path.resolve(__dirname, '../../mock-data');

class MockDataLoader {
  constructor() {
    this.timetable = [];
    this.routines = [];
    this.mockEvents = [];
    this.isLoaded = false;
  }

  /**
   * Load mock fixtures if demo mode is enabled or for dev tests.
   */
  loadFixtures() {
    if (this.isLoaded) return;

    try {
      // 1. Load Timetable Schedule
      const timetablePath = path.join(MOCK_DATA_DIR, 'timetable_schedule.csv');
      const rawTimetable = loadCsvFile(timetablePath);
      this.timetable = rawTimetable.map((row) => ({
        dayOfWeek: row.day_of_week,
        startTime: row.start_time,
        endTime: row.end_time,
        activity: row.activity,
        location: row.location,
        source: row.source || 'mock',
      }));

      // 2. Load User Routines
      const routinePath = path.join(MOCK_DATA_DIR, 'mock_user_routine.csv');
      const rawRoutines = loadCsvFile(routinePath);
      this.routines = rawRoutines.map((row) => ({
        routineKey: row.routine_key,
        usualTime: row.usual_time,
        description: row.description,
        source: row.source || 'mock',
      }));

      // 3. Load Mock Event History
      const eventHistoryPath = path.join(MOCK_DATA_DIR, 'mock_event_history.csv');
      const rawEvents = loadCsvFile(eventHistoryPath);
      this.mockEvents = rawEvents.map((row) => ({
        schemaVersion: 1,
        eventId: row.event_id || eventService.generateEventId(),
        deviceId: row.device_id || config.defaultDeviceId,
        userId: null,
        type: row.type,
        occurredAt: row.occurred_at || new Date().toISOString(),
        source: 'mock',
        origin: row.origin || 'demo',
        message: row.message || row.type,
        details: { isDemoFixture: true },
      }));

      // Pass mock events to eventService in-memory pool
      eventService.setMockEvents(this.mockEvents);

      this.isLoaded = true;
      console.log(`[MockData] Loaded ${this.timetable.length} schedule slots, ${this.routines.length} routines, and ${this.mockEvents.length} mock events.`);
    } catch (err) {
      console.error('[MockData] Error loading fixtures:', err.message);
    }
  }

  getTimetable() {
    if (!this.isLoaded) this.loadFixtures();
    return this.timetable;
  }

  getRoutines() {
    if (!this.isLoaded) this.loadFixtures();
    return this.routines;
  }

  getMockEvents() {
    if (!this.isLoaded) this.loadFixtures();
    return this.mockEvents;
  }
}

module.exports = new MockDataLoader();
