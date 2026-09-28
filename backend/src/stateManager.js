/**
 * CycleGuard Backend — State Manager
 * In-memory device state with change notifications.
 * Designed so a database can replace this later.
 */

const EventEmitter = require('events');

class StateManager extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
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
    this.emit('device:changed', deviceId, updated);
    return { ...updated };
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
   */
  setConnectionState(deviceId, connectionState) {
    return this.updateDevice(deviceId, {
      connectionState,
      lastSeen: connectionState === 'CONNECTED' ? new Date().toISOString() : undefined,
    });
  }
}

// Singleton
module.exports = new StateManager();
