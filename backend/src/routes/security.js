/**
 * CycleGuard Backend — Security Routes
 * ARM / DISARM / ALARM_CLEAR commands with biometric / PIN authorization
 * and real-time MQTT transmission to ESP32.
 *
 * Finding F1: Checks MQTT connectivity, verifies transmission,
 * sets pending state awaiting device acknowledgement, and rejects if link is down.
 */

const express = require('express');
const { publishCommand, isMqttConnected } = require('../mqtt');
const stateManager = require('../stateManager');
const auth = require('../auth');
const config = require('../config');

const router = express.Router();

/**
 * Middleware: Verify action authorization via single-use authToken or PIN.
 * @param {object} req
 * @param {object} res
 * @param {'ARM' | 'DISARM' | 'ALARM_CLEAR'} action
 * @returns {{ authorized: boolean, clientId: string }}
 */
function authorizeAction(req, res, action) {
  const clientId = req.ip;
  const { authToken, pin } = req.body;

  // 1. Try single-use authToken (from WebAuthn or verified PIN session)
  if (authToken) {
    const tokenResult = auth.verifyAndConsumeAuthToken(authToken, action);
    if (tokenResult.valid) {
      return { authorized: true, clientId };
    }
    return {
      authorized: false,
      response: res.status(401).json({
        success: false,
        error: tokenResult.error || 'Invalid or expired authorization token.',
      }),
    };
  }

  // 2. Direct PIN fallback
  if (pin) {
    const pinResult = auth.verifyPin(pin, clientId, action);
    if (pinResult.success) {
      return { authorized: true, clientId };
    }
    return {
      authorized: false,
      response: res.status(401).json({
        success: false,
        error: pinResult.error || 'Incorrect PIN.',
        lockedOut: pinResult.lockedOut,
        remainingSeconds: pinResult.remainingSeconds,
        attemptsRemaining: pinResult.attemptsRemaining,
      }),
    };
  }

  // Neither provided
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

  // Finding F1: Check MQTT connectivity before claiming success
  if (!isMqttConnected()) {
    console.warn(`[Security] Failed to arm device ${deviceId}: MQTT broker disconnected.`);
    return res.status(503).json({
      success: false,
      error: 'Device link unavailable. MQTT broker is offline.',
    });
  }

  // Publish ARM command to device via MQTT
  const sent = publishCommand(deviceId, 'ARM');
  if (!sent) {
    return res.status(503).json({
      success: false,
      error: 'Device link unavailable. Command could not be transmitted.',
    });
  }

  // Finding F1: Set pending command awaiting real confirmation from ESP32
  stateManager.setPending(deviceId, 'ARM', 8000);

  // In local development mode without physical hardware, allow auto-confirm if enabled
  if (config.nodeEnv !== 'production' && process.env.AUTO_CONFIRM_DEV === 'true') {
    stateManager.armDevice(deviceId);
  }

  console.log(`[Security] Device ${deviceId} ARM command dispatched. Awaiting device confirmation.`);

  res.status(202).json({
    success: true,
    pending: true,
    deviceId,
    message: 'ARM command dispatched to device. Awaiting confirmation.',
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

  // Finding F1: Check MQTT connectivity
  if (!isMqttConnected()) {
    console.warn(`[Security] Failed to disarm device ${deviceId}: MQTT broker disconnected.`);
    return res.status(503).json({
      success: false,
      error: 'Device link unavailable. MQTT broker is offline.',
    });
  }

  // Publish DISARM command to device via MQTT
  const sent = publishCommand(deviceId, 'DISARM');
  if (!sent) {
    return res.status(503).json({
      success: false,
      error: 'Device link unavailable. Command could not be transmitted.',
    });
  }

  // Finding F1: Set pending command awaiting real confirmation from ESP32
  stateManager.setPending(deviceId, 'DISARM', 8000);

  if (config.nodeEnv !== 'production' && process.env.AUTO_CONFIRM_DEV === 'true') {
    stateManager.disarmDevice(deviceId);
  }

  console.log(`[Security] Device ${deviceId} DISARM command dispatched. Awaiting device confirmation.`);

  res.status(202).json({
    success: true,
    pending: true,
    deviceId,
    message: 'DISARM command dispatched to device. Awaiting confirmation.',
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

  // Finding F1: Check MQTT connectivity
  if (!isMqttConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Device link unavailable. MQTT broker is offline.',
    });
  }

  // Publish DISARM command (clears alarm on ESP32 buzzer)
  const sent = publishCommand(deviceId, 'DISARM');
  if (!sent) {
    return res.status(503).json({
      success: false,
      error: 'Device link unavailable. Command could not be transmitted.',
    });
  }

  stateManager.setPending(deviceId, 'ALARM_CLEAR', 8000);

  if (config.nodeEnv !== 'production' && process.env.AUTO_CONFIRM_DEV === 'true') {
    stateManager.disarmDevice(deviceId);
  }

  console.log(`[Security] Device ${deviceId} ALARM_CLEAR command dispatched.`);

  res.status(202).json({
    success: true,
    pending: true,
    deviceId,
    message: 'ALARM_CLEAR command dispatched. Awaiting confirmation.',
  });
});

module.exports = router;
