/**
 * CycleGuard Backend — MQTT Client
 * Connects to EMQX Cloud, subscribes to device topics,
 * and publishes commands.
 */

const mqtt = require('mqtt');
const config = require('./config');
const stateManager = require('./stateManager');

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
    try {
      const payload = JSON.parse(message.toString());
      handleMqttMessage(topic, payload);
    } catch (err) {
      console.error('[MQTT] Failed to parse message:', err.message);
    }
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
 */
function handleMqttMessage(topic, payload) {
  const deviceId = payload.deviceId || config.defaultDeviceId;
  console.log(`[MQTT] Message on ${topic}:`, JSON.stringify(payload));

  // Match topic pattern
  if (topic.endsWith('/status')) {
    const updates = {};

    if (payload.securityState) {
      updates.securityState = payload.securityState;
      // Finding F1: Clear pending action when confirmed by physical device
      stateManager.checkAndClearPending(deviceId, payload.securityState);
    }

    if (typeof payload.alarmActive === 'boolean') {
      updates.alarmActive = payload.alarmActive;
    }

    // Finding F7 & F8: Any status message from device confirms it is connected
    if (payload.status === 'ONLINE' || payload.securityState) {
      stateManager.setConnectionState(deviceId, 'CONNECTED');
    } else if (payload.status === 'OFFLINE') {
      stateManager.setConnectionState(deviceId, 'DISCONNECTED');
    }

    if (Object.keys(updates).length > 0) {
      stateManager.updateDevice(deviceId, updates);
    }
  } else if (topic.endsWith('/alert')) {
    // Alert from device
    if (payload.event === 'MOVEMENT_DETECTED' || payload.type === 'MOVEMENT_DETECTED' || payload.event === 'MOVEMENT') {
      stateManager.recordMovement(deviceId, payload.timestamp);
    }
    if (payload.event === 'ALARM_ACTIVE') {
      stateManager.activateAlarm(deviceId, payload.timestamp);
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
  const payload = JSON.stringify({
    command,
    timestamp: new Date().toISOString(),
  });

  client.publish(topic, payload, { qos: 1 }, (err) => {
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
