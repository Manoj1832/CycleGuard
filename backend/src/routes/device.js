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

const pushNotification = require('../pushNotification');

/**
 * POST /api/device/:deviceId/fcm/register
 * Registers an FCM device token for push notifications.
 */
router.post('/:deviceId/fcm/register', (req, res) => {
  const { deviceId } = req.params;
  const { fcmToken } = req.body;

  if (!fcmToken) {
    return res.status(400).json({ success: false, error: 'fcmToken is required.' });
  }

  pushNotification.registerToken(deviceId, fcmToken);

  res.json({
    success: true,
    message: 'FCM device token registered.',
    deviceId,
  });
});

module.exports = router;
