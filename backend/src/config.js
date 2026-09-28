/**
 * CycleGuard Backend — Configuration
 * Loads environment variables and provides a frozen config object.
 */

require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mqtt: {
    host: process.env.MQTT_HOST || 'j22792b7.ala.eu-central-1.emqxsl.com',
    port: parseInt(process.env.MQTT_PORT, 10) || 8883,
    username: process.env.MQTT_USERNAME || 'cycleguard',
    password: process.env.MQTT_PASSWORD || '',
    clientId: process.env.MQTT_CLIENT_ID || 'cycleguard-backend-primary',
    reconnectPeriod: 5000,
    connectTimeout: 30000,
  },

  cors: {
    origins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
      : ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8080'],
  },

  // PIN & Setup Security — Finding F3 & F4
  pinHash: process.env.PIN_HASH || null,
  defaultPin: process.env.DEFAULT_PIN || null,
  setupToken: process.env.SETUP_TOKEN || null,

  // Authentication & WebAuthn
  auth: {
    rpName: process.env.RP_NAME || 'CycleGuard',
    rpId: process.env.RP_ID || 'localhost',
    expectedOrigins: process.env.EXPECTED_ORIGINS
      ? process.env.EXPECTED_ORIGINS.split(',').map((s) => s.trim())
      : ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8080', 'http://localhost:3000'],
    lockoutMaxAttempts: 5,
    lockoutDurationSeconds: parseInt(process.env.LOCKOUT_SECONDS, 10) || 30,
    mockMode: process.env.AUTH_MOCK_MODE === 'true',
  },

  // Where credentials.json / state.json live. On Render, point this at a persistent
  // disk mount (e.g. /var/data) or these files vanish on every deploy / spin-down.
  dataDir: process.env.DATA_DIR || require('path').join(__dirname, '../data'),

  // Device
  defaultDeviceId: '001',

  // MQTT Topics
  topics: {
    command: (deviceId) => `cycleguard/device/${deviceId}/command`,
    status: (deviceId) => `cycleguard/device/${deviceId}/status`,
    alert: (deviceId) => `cycleguard/device/${deviceId}/alert`,
    test: (deviceId) => `cycleguard/device/${deviceId}/test`,
  },
};

// Refuse to boot a production server that has no real PIN configured.
if (config.nodeEnv === 'production' && !config.pinHash && !config.defaultPin) {
  throw new Error('PIN_HASH (or DEFAULT_PIN) must be set when NODE_ENV=production. Generate one with: node backend/scripts/hashPin.js <pin>');
}

Object.freeze(config);
Object.freeze(config.mqtt);
Object.freeze(config.cors);
Object.freeze(config.auth);
Object.freeze(config.topics);

module.exports = config;
