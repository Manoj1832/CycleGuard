/**
 * CycleGuard Backend — WebSocket Server
 * Broadcasts device state changes to connected frontend clients.
 * Finding F8: Origin verification, fresh-only movement broadcasts, and explicit alarm active/inactive broadcasts.
 */

const { WebSocketServer } = require('ws');
const stateManager = require('./stateManager');
const config = require('./config');

let wss = null;
let lastMovementBroadcastTimestamp = null;

/**
 * Initialize WebSocket server on existing HTTP server.
 * @param {http.Server} server
 */
function initWebSocket(server) {
  wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info, callback) => {
      // Finding F8: Verify origin in production
      const origin = info.origin || info.req.headers.origin;

      if (!origin || config.nodeEnv !== 'production') {
        return callback(true);
      }

      const allowed = config.cors.origins.some((allowedOrigin) => {
        return origin === allowedOrigin || origin.endsWith(allowedOrigin.replace(/^https?:\/\//, ''));
      });

      if (allowed) {
        return callback(true);
      }

      console.warn(`[WS] Rejected connection from unauthorized origin: ${origin}`);
      return callback(false, 403, 'Unauthorized Origin');
    },
  });

  console.log('[WS] WebSocket server initialized on /ws');

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Client connected from ${ip}`);

    // Send current device state on connection
    const deviceState = stateManager.getDevice(config.defaultDeviceId);
    sendToClient(ws, {
      type: 'security_state',
      deviceId: deviceState.deviceId,
      state: deviceState.securityState,
      timestamp: new Date().toISOString(),
    });

    sendToClient(ws, {
      type: 'device_status',
      deviceId: deviceState.deviceId,
      status: deviceState.connectionState === 'CONNECTED' ? 'ONLINE' : 'OFFLINE',
    });

    sendToClient(ws, {
      type: 'alarm',
      deviceId: deviceState.deviceId,
      active: !!deviceState.alarmActive,
      timestamp: new Date().toISOString(),
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log('[WS] Received from client:', data);
      } catch (err) {
        console.error('[WS] Invalid message from client');
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected from ${ip}`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
    });
  });

  // Listen for state changes and broadcast to all clients
  stateManager.on('device:changed', (deviceId, deviceState) => {
    broadcastDeviceState(deviceId, deviceState);
  });
}

/**
 * Broadcast device state change to all connected clients.
 * Finding F8: Only broadcast movement if timestamp is fresh; broadcast alarm active: false on clear.
 */
function broadcastDeviceState(deviceId, deviceState) {
  if (!wss) return;

  // Send security state
  broadcast({
    type: 'security_state',
    deviceId,
    state: deviceState.securityState,
    timestamp: new Date().toISOString(),
  });

  // Finding F8: Always broadcast current alarm state (active or cleared)
  broadcast({
    type: 'alarm',
    deviceId,
    active: !!deviceState.alarmActive,
    timestamp: new Date().toISOString(),
  });

  // Finding F8: Broadcast movement info ONLY if this is a new movement event
  if (deviceState.lastActivity && deviceState.lastActivity.timestamp !== lastMovementBroadcastTimestamp) {
    lastMovementBroadcastTimestamp = deviceState.lastActivity.timestamp;
    broadcast({
      type: 'movement_detected',
      deviceId,
      timestamp: deviceState.lastActivity.timestamp,
    });
  }

  // Send connection state
  broadcast({
    type: 'device_status',
    deviceId,
    status: deviceState.connectionState === 'CONNECTED' ? 'ONLINE' : 'OFFLINE',
  });
}

/**
 * Send message to a specific client.
 */
function sendToClient(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Broadcast to all connected clients.
 */
function broadcast(data) {
  if (!wss) return;

  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

/**
 * Get count of connected clients.
 */
function getClientCount() {
  return wss ? wss.clients.size : 0;
}

module.exports = {
  initWebSocket,
  broadcast,
  getClientCount,
};
