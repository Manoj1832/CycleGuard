/**
 * CycleGuard Backend — Security Routes
 * ARM, DISARM, and Alarm Clear endpoints.
 * Authorizes via WebAuthn AuthToken OR 4-digit PIN before publishing MQTT commands.
 */

const express = require('express');
const auth = require('../auth');
const { publishCommand } = require('../mqtt');
const stateManager = require('../stateManager');

const router = express.Router();

/**
 * Validate authorization for a security action.
 * Accepts either a single-use authToken or a 4-digit PIN.
 */
function authorizeAction(req, res, action) {
  const { pin, authToken } = req.body;
  const clientId = req.ip;

  if (authToken) {
    const authResult = auth.verifyAndConsumeAuthToken(authToken, action);
    if (!authResult.valid) {
      return { authorized: false, response: res.status(401).json({ success: false, error: authResult.error }) };
    }
    return { authorized: true };
  }

  if (pin) {
    const pinResult = auth.verifyPin(pin, clientId, action);
    if (!pinResult.success) {
      return {
        authorized: false,
        response: res.status(401).json({
          success: false,
          error: pinResult.error,
          lockedOut: pinResult.lockedOut,
          remainingSeconds: pinResult.remainingSeconds,
          attemptsRemaining: pinResult.attemptsRemaining,
        }),
      };
    }
    return { authorized: true };
  }

  return {
    authorized: false,
    response: res.status(401).json({
      success: false,
      error: 'Authentication required. Provide biometric authToken or PIN.',
    }),
  };
}

/**
 * POST /api/device/:deviceId/arm
 * Turn security ON.
 */
router.post('/:deviceId/arm', (req, res) => {
  const { deviceId } = req.params;

  // Authorization check
  const authCheck = authorizeAction(req, res, 'ARM');
  if (!authCheck.authorized) return;

  // Publish ARM command to device via MQTT
  publishCommand(deviceId, 'ARM');

  // Update local state
  const device = stateManager.armDevice(deviceId);

  console.log(`[Security] Device ${deviceId} ARMED (Authorized)`);

  res.json({
    success: true,
    deviceId,
    state: device.securityState,
  });
});

/**
 * POST /api/device/:deviceId/disarm
 * Turn security OFF.
 */
router.post('/:deviceId/disarm', (req, res) => {
  const { deviceId } = req.params;

  // Authorization check
  const authCheck = authorizeAction(req, res, 'DISARM');
  if (!authCheck.authorized) return;

  // Publish DISARM command to device via MQTT
  publishCommand(deviceId, 'DISARM');

  // Update local state
  const device = stateManager.disarmDevice(deviceId);

  console.log(`[Security] Device ${deviceId} DISARMED (Authorized)`);

  res.json({
    success: true,
    deviceId,
    state: device.securityState,
  });
});

/**
 * POST /api/device/:deviceId/alarm/clear
 * Stop active alarm.
 */
router.post('/:deviceId/alarm/clear', (req, res) => {
  const { deviceId } = req.params;

  // Authorization check
  const authCheck = authorizeAction(req, res, 'ALARM_CLEAR');
  if (!authCheck.authorized) return;

  // Publish DISARM command (clears alarm on ESP32 buzzer)
  publishCommand(deviceId, 'DISARM');

  // Update local state
  const device = stateManager.disarmDevice(deviceId);

  console.log(`[Security] Device ${deviceId} ALARM CLEARED (Authorized)`);

  res.json({
    success: true,
    deviceId,
    state: device.securityState,
  });
});

module.exports = router;
