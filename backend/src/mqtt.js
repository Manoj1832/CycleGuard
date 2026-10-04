/**
 * CycleGuard Backend — MQTT Client
 * Connects to EMQX Cloud, subscribes to device topics,
 * and publishes commands.
 */

const mqtt = require('mqtt');
const config = require('./config');
const stateManager = require('./stateManager');
const pushNotification = require('./pushNotification');

let client = null;
let isConnected = false;

/**
 * Connect to MQTT broker.
 * @returns {object} mqtt client
 */
function connectMqtt() {
  const { host, port, username, password, clientId, reconnectPeriod, connectTimeout } = config.mqtt;

  const url = `mqtts://${host}:${port}`;

  console.log(`[MQTT] Connecting to ${host}:${port}...`);

  client = mqtt.connect(url, {
    clientId,
    username,
    password,
    reconnectPeriod,
    connectTimeout,
    clean: true,
    rejectUnauthorized: true, // Verify TLS certificate
  });

  client.on('connect', () => {
    isConnected = true;
    console.log('[MQTT] Connected to broker');

    // Subscribe to device topics
    const deviceId = config.defaultDeviceId;
    const topics = [
      config.topics.status(deviceId),
      config.topics.alert(deviceId),
      config.topics.test(deviceId),
    ];

    client.subscribe(topics, { qos: 1 }, (err, granted) => {
      if (err) {
        console.error('[MQTT] Subscribe error:', err);
      } else {
        console.log('[MQTT] Subscribed to:', granted.map((g) => g.topic).join(', '));
      }
    });
  });

  client.on('message', (topic, message) => {
    const raw = message.toString().trim();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      // Support raw string payloads (e.g. "ARMED", "DISARMED", "ALARM", "VIBRATION_DETECTED")
      payload = raw;
    }
    handleMqttMessage(topic, payload);
  });

  client.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
  });

  client.on('close', () => {
    isConnected = false;
    console.log('[MQTT] Connection closed');
  });

  client.on('reconnect', () => {
    console.log('[MQTT] Reconnecting...');
  });

  client.on('offline', () => {
    isConnected = false;
    console.log('[MQTT] Offline');
  });

  return client;
}

/**
 * Handle incoming MQTT messages from device.
 * Supports both plain-string payloads (DISARMED, ARMED, ALARM, VIBRATION_DETECTED)
 * and structured JSON payloads.
 */
function handleMqttMessage(topic, payload) {
  let deviceId = config.defaultDeviceId;
  let statusStr = null;
  let eventStr = null;
  let alarmActive = null;

  if (typeof payload === 'string') {
    const str = payload.toUpperCase();
    console.log(`[MQTT] Raw message on ${topic}:`, str);
    if (topic.endsWith('/status')) {
      statusStr = str;
    } else if (topic.endsWith('/alert')) {
      eventStr = str;
    }
  } else if (typeof payload === 'object' && payload !== null) {
    console.log(`[MQTT] JSON message on ${topic}:`, JSON.stringify(payload));
    deviceId = payload.deviceId || config.defaultDeviceId;
    statusStr = (payload.securityState || payload.status || '').toUpperCase();
    eventStr = (payload.event || payload.type || '').toUpperCase();
    if (typeof payload.alarmActive === 'boolean') {
      alarmActive = payload.alarmActive;
    }
  }

  // Match topic pattern
  if (topic.endsWith('/status')) {
    const updates = {};

    if (statusStr === 'ARMED' || statusStr === 'ON') {
      updates.securityState = 'ON';
      updates.alarmActive = false;
      stateManager.checkAndClearPending(deviceId, 'ON');
      stateManager.setConnectionState(deviceId, 'CONNECTED');
    } else if (statusStr === 'DISARMED' || statusStr === 'OFF') {
      updates.securityState = 'OFF';
      updates.alarmActive = false;
      stateManager.checkAndClearPending(deviceId, 'OFF');
      stateManager.setConnectionState(deviceId, 'CONNECTED');
    } else if (statusStr === 'ALARM') {
      updates.securityState = 'ALARM';
      updates.alarmActive = true;
      stateManager.checkAndClearPending(deviceId, 'ALARM');
      stateManager.setConnectionState(deviceId, 'CONNECTED');
    } else if (statusStr === 'ONLINE') {
      stateManager.setConnectionState(deviceId, 'CONNECTED');
    } else if (statusStr === 'OFFLINE') {
      stateManager.setConnectionState(deviceId, 'DISCONNECTED');
    }

    if (alarmActive !== null) {
      updates.alarmActive = alarmActive;
    }

    if (Object.keys(updates).length > 0) {
      stateManager.updateDevice(deviceId, updates);
    }
  } else if (topic.endsWith('/alert')) {
    if (eventStr === 'VIBRATION_DETECTED' || eventStr === 'MOVEMENT_DETECTED' || eventStr === 'MOVEMENT') {
      stateManager.recordMovement(deviceId);
      stateManager.activateAlarm(deviceId);
      pushNotification.sendAlarmNotification(deviceId, { type: eventStr });
    }
    if (eventStr === 'ALARM_ACTIVE') {
      stateManager.activateAlarm(deviceId);
      pushNotification.sendAlarmNotification(deviceId, { type: 'ALARM_ACTIVE' });
    }
  } else if (topic.endsWith('/test')) {
    console.log(`[MQTT] Test message from device ${deviceId}:`, payload);
  }
}

/**
 * Publish a command to a device.
 * @param {string} deviceId
 * @param {string} command — 'ARM' or 'DISARM'
 */
function publishCommand(deviceId, command) {
  if (!client || !isConnected) {
    console.error('[MQTT] Cannot publish — not connected');
    return false;
  }

  const topic = config.topics.command(deviceId);

  // Send exact command string ("ARM" or "DISARM")
  client.publish(topic, command, { qos: 1 }, (err) => {
    if (err) {
      console.error('[MQTT] Publish error:', err);
    } else {
      console.log(`[MQTT] Published ${command} to ${topic}`);
    }
  });

  return true;
}

/**
 * Check if MQTT is connected.
 */
function isMqttConnected() {
  return isConnected;
}

/**
 * Graceful disconnect.
 */
function disconnectMqtt() {
  return new Promise((resolve) => {
    if (client) {
      client.end(false, {}, () => {
        console.log('[MQTT] Disconnected gracefully');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  connectMqtt,
  publishCommand,
  isMqttConnected,
  disconnectMqtt,
};
