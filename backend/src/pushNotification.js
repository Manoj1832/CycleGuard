/**
 * CycleGuard Backend — Push Notification Service (FCM)
 *
 * Sends high-priority push notifications when movement/tamper alerts are detected.
 * Gracefully operates in mock/no-op mode if FIREBASE_SERVICE_ACCOUNT is not configured.
 */

const admin = require('firebase-admin');

let isInitialized = false;

// Initialize Firebase Admin SDK
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    isInitialized = true;
    console.log('[FCM] Firebase Admin initialized successfully.');
  } else {
    console.log('[FCM] FIREBASE_SERVICE_ACCOUNT env var not provided. Push notifications in standby mode.');
  }
} catch (err) {
  console.warn('[FCM] Error initializing Firebase Admin:', err.message);
}

// In-memory token storage (deviceId -> Set of FCM tokens)
const deviceTokens = new Map();

/**
 * Register an FCM device token for a specific device.
 * @param {string} deviceId
 * @param {string} token
 */
function registerToken(deviceId, token) {
  if (!deviceId || !token) return;

  if (!deviceTokens.has(deviceId)) {
    deviceTokens.set(deviceId, new Set());
  }

  deviceTokens.get(deviceId).add(token);
  console.log(`[FCM] Registered token for device ${deviceId} (total: ${deviceTokens.get(deviceId).size})`);
}

/**
 * Unregister a token (e.g. on invalid token response).
 * @param {string} deviceId
 * @param {string} token
 */
function unregisterToken(deviceId, token) {
  if (deviceTokens.has(deviceId)) {
    deviceTokens.get(deviceId).delete(token);
  }
}

/**
 * Send an alarm notification to all registered tokens for a device.
 * @param {string} deviceId
 * @param {object} alertData
 */
async function sendAlarmNotification(deviceId, alertData = {}) {
  const tokens = deviceTokens.get(deviceId);
  if (!tokens || tokens.size === 0) {
    console.log(`[FCM] No registered push tokens for device ${deviceId}`);
    return;
  }

  if (!isInitialized) {
    console.log(`[FCM] Standby mode: would notify ${tokens.size} token(s) for device ${deviceId}`);
    return;
  }

  const timestamp = alertData.timestamp || new Date().toISOString();
  const alertType = alertData.type || 'MOVEMENT_DETECTED';

  const message = {
    notification: {
      title: '⚠️ CycleGuard Alert!',
      body: 'Suspicious movement detected on your bicycle!',
    },
    data: {
      deviceId: String(deviceId),
      type: alertType,
      timestamp: String(timestamp),
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'cycleguard_alerts',
        sound: 'default',
        priority: 'max',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
      },
      payload: {
        aps: {
          alert: {
            title: '⚠️ CycleGuard Alert!',
            body: 'Suspicious movement detected on your bicycle!',
          },
          sound: 'default',
          badge: 1,
          contentAvailable: true,
        },
      },
    },
  };

  const tokenList = Array.from(tokens);
  for (const token of tokenList) {
    try {
      await admin.messaging().send({
        ...message,
        token,
      });
      console.log(`[FCM] Sent alarm notification to token: ${token.substring(0, 10)}...`);
    } catch (err) {
      console.warn(`[FCM] Error sending to token ${token.substring(0, 10)}...:`, err.message);
      if (
        err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token'
      ) {
        unregisterToken(deviceId, token);
      }
    }
  }
}

module.exports = {
  registerToken,
  unregisterToken,
  sendAlarmNotification,
};
