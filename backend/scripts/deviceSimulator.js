#!/usr/bin/env node
/**
 * CycleGuard — Virtual Bicycle Device Simulator
 * Emulates the ESP32-C3 hardware node over MQTT.
 *
 * Subscribes to: cycleguard/device/001/command
 * Publishes to:  cycleguard/device/001/status
 *                cycleguard/device/001/alert
 *
 * Usage: node backend/scripts/deviceSimulator.js
 */

const mqtt = require('mqtt');
const config = require('../src/config');

const deviceId = config.defaultDeviceId || '001';
const host = config.mqtt.host;
const port = config.mqtt.port;
const username = config.mqtt.username;
const password = config.mqtt.password;

const topicCommand = `cycleguard/device/${deviceId}/command`;
const topicStatus = `cycleguard/device/${deviceId}/status`;
const topicAlert = `cycleguard/device/${deviceId}/alert`;

let securityState = 'OFF';
let alarmActive = false;

console.log('==========================================');
console.log('  CycleGuard Virtual Device Simulator');
console.log(`  Device ID : ${deviceId}`);
console.log(`  Broker    : ${host}:${port}`);
console.log('==========================================\n');

const client = mqtt.connect(`mqtts://${host}:${port}`, {
  clientId: `cycleguard-simulator-${deviceId}`,
  username,
  password,
  clean: true,
  rejectUnauthorized: true,
  will: {
    topic: topicStatus,
    payload: JSON.stringify({ deviceId, status: 'OFFLINE' }),
    qos: 1,
    retain: true,
  },
});

function publishStatus() {
  const payload = {
    deviceId,
    status: 'ONLINE',
    securityState,
    alarmActive,
    timestamp: new Date().toISOString(),
  };

  client.publish(topicStatus, JSON.stringify(payload), { qos: 1, retain: true }, (err) => {
    if (err) console.error('[Simulator] Status publish error:', err.message);
    else console.log(`[Simulator] Status published -> securityState: ${securityState}, alarmActive: ${alarmActive}`);
  });
}

function publishMovementAlert() {
  const payload = {
    deviceId,
    event: 'MOVEMENT_DETECTED',
    timestamp: new Date().toISOString(),
  };

  client.publish(topicAlert, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) console.error('[Simulator] Alert publish error:', err.message);
    else console.log('[Simulator] 🚨 Alert published -> MOVEMENT_DETECTED');
  });
}

client.on('connect', () => {
  console.log('[Simulator] Connected to EMQX Cloud MQTT broker.');

  client.subscribe(topicCommand, { qos: 1 }, (err) => {
    if (err) {
      console.error('[Simulator] Subscribe error:', err.message);
    } else {
      console.log(`[Simulator] Subscribed to command topic: ${topicCommand}`);
      publishStatus();
      console.log('\n[Simulator] Ready! Commands from web UI will be received here.');
      console.log('Type "m" and press Enter anytime to simulate physical movement detection.\n');
    }
  });
});

client.on('message', (topic, message) => {
  try {
    const raw = message.toString();
    console.log(`[Simulator] Received command on ${topic}:`, raw);

    let command = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.command) command = parsed.command;
    } catch (e) {}

    command = command.trim().toUpperCase();

    if (command === 'ARM') {
      securityState = 'ON';
      alarmActive = false;
      console.log('[Simulator] 🔒 Security ARMED! Acknowledging status...');
      publishStatus();
    } else if (command === 'DISARM') {
      securityState = 'OFF';
      alarmActive = false;
      console.log('[Simulator] 🔓 Security DISARMED! Acknowledging status...');
      publishStatus();
    }
  } catch (err) {
    console.error('[Simulator] Error handling message:', err.message);
  }
});

// Allow simulating movement via terminal stdin
process.stdin.setEncoding('utf8');
process.stdin.on('data', (input) => {
  const key = input.trim().toLowerCase();
  if (key === 'm') {
    if (securityState === 'ON') {
      console.log('[Simulator] ⚡ Vibration detected while armed! Triggering ALARM...');
      alarmActive = true;
      securityState = 'ALARM';
      publishMovementAlert();
      publishStatus();
    } else {
      console.log('[Simulator] Vibration detected, but bike is DISARMED (ignored).');
    }
  }
});
