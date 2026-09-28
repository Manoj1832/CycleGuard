/**
 * CycleGuard Backend — Device Routes
 */

const express = require('express');
const stateManager = require('../stateManager');

const router = express.Router();

/**
 * GET /api/device/:deviceId/status
 * Returns current device state.
 */
router.get('/:deviceId/status', (req, res) => {
  const { deviceId } = req.params;
  const device = stateManager.getDevice(deviceId);

  res.json({
    success: true,
    deviceId: device.deviceId,
    securityState: device.securityState,
    connectionState: device.connectionState,
    alarmActive: device.alarmActive,
    lastActivity: device.lastActivity,
    lastSeen: device.lastSeen,
  });
});

module.exports = router;
