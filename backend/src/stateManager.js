/**
 * CycleGuard Backend — State Manager
 * Persistent device state with change notifications and pending command tracking.
 * Finding F1, F6 & F8: Preserves state across restarts, tracks pending commands, and preserves lastSeen.
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const DATA_DIR = config.dataDir;
const STATE_FILE = path.join(DATA_DIR, 'state.json');

class StateManager extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    this.pendingActions = new Map(); // deviceId -> { action, expiresAt, timer }
    this.loadStateFromDisk();
  }

  /**
   * Load device state from disk.
   */
  loadStateFromDisk() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach((dev) => {
            if (dev && dev.deviceId) {
              this.devices.set(dev.deviceId, dev);
            }
          });
          console.log(`[State] Restored ${this.devices.size} device states from disk.`);
        }
      }
    } catch (err) {
      console.error('[State] Error loading state from disk:', err.message);
    }
  }

  /**
   * Save device state to disk.
   */
  saveStateToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const list = Array.from(this.devices.values());
      fs.writeFileSync(STATE_FILE, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.error('[State] Error saving state to disk:', err.message);
    }
  }

  /**
   * Get or create device state.
   * @param {string} deviceId
   * @returns {object}
   */
  getDevice(deviceId) {
    if (!this.devices.has(deviceId)) {
      this.devices.set(deviceId, {
        deviceId,
        securityState: 'OFF',
        connectionState: 'DISCONNECTED',
        alarmActive: false,
        lastActivity: null,
        lastSeen: null,
      });
    }
    return { ...this.devices.get(deviceId) };
  }

  /**
   * Update device state and emit change event.
   * @param {string} deviceId
   * @param {object} updates
   */
  updateDevice(deviceId, updates) {
    const current = this.getDevice(deviceId);
    const updated = { ...current, ...updates };
    this.devices.set(deviceId, updated);
    this.saveStateToDisk();
    this.emit('device:changed', deviceId, updated);
    return { ...updated };
  }

  /**
   * Set a pending command awaiting device confirmation.
   * Finding F1: Backend does not falsely claim state is confirmed until ESP32 acknowledges.
   * @param {string} deviceId
   * @param {'ARM' | 'DISARM' | 'ALARM_CLEAR'} action
   * @param {number} timeoutMs
   */
  setPending(deviceId, action, timeoutMs = 8000) {
    // Clear any existing pending timer
    const existing = this.pendingActions.get(deviceId);
    if (existing?.timer) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      const pending = this.pendingActions.get(deviceId);
      if (pending && pending.action === action) {
        console.warn(`[Security] Pending action ${action} for device ${deviceId} timed out without confirmation.`);
        this.pendingActions.delete(deviceId);
        this.emit('command:timeout', deviceId, { action });
      }
    }, timeoutMs);

    this.pendingActions.set(deviceId, {
      action,
      expiresAt: Date.now() + timeoutMs,
      timer,
    });
  }

  /**
   * Check and clear pending action when confirmed by device.
   * @param {string} deviceId
   * @param {string} confirmedState
   */
  checkAndClearPending(deviceId, confirmedState) {
    const pending = this.pendingActions.get(deviceId);
    if (!pending) return false;

    const matches =
      (pending.action === 'ARM' && (confirmedState === 'ON' || confirmedState === 'ARMED')) ||
      (pending.action === 'DISARM' && (confirmedState === 'OFF' || confirmedState === 'DISARMED')) ||
      (pending.action === 'ALARM_CLEAR' && confirmedState !== 'ALARM');

    if (matches) {
      clearTimeout(pending.timer);
      this.pendingActions.delete(deviceId);
      console.log(`[Security] Pending action ${pending.action} confirmed by device ${deviceId}.`);
      return true;
    }
    return false;
  }

  /**
   * Record movement event.
   */
  recordMovement(deviceId, timestamp) {
    return this.updateDevice(deviceId, {
      lastActivity: {
        message: 'Movement detected',
        timestamp: timestamp || new Date().toISOString(),
      },
    });
  }

  /**
   * Set alarm active.
   */
  activateAlarm(deviceId, timestamp) {
    return this.updateDevice(deviceId, {
      securityState: 'ALARM',
      alarmActive: true,
      lastActivity: {
        message: 'Movement detected',
        timestamp: timestamp || new Date().toISOString(),
      },
    });
  }

  /**
   * Arm device.
   */
  armDevice(deviceId) {
    return this.updateDevice(deviceId, {
      securityState: 'ON',
      alarmActive: false,
    });
  }

  /**
   * Disarm device.
   */
  disarmDevice(deviceId) {
    return this.updateDevice(deviceId, {
      securityState: 'OFF',
      alarmActive: false,
    });
  }

  /**
   * Update connection state.
   * Finding F8: Do not overwrite lastSeen with undefined on disconnect.
   */
  setConnectionState(deviceId, connectionState) {
    const updates = { connectionState };
    if (connectionState === 'CONNECTED') {
      updates.lastSeen = new Date().toISOString();
    }
    return this.updateDevice(deviceId, updates);
  }
}

// Singleton
module.exports = new StateManager();
