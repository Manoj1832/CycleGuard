/**
 * CycleGuard — WebSocket Client
 * Manages WebSocket connection to the backend.
 * Reconnects automatically with exponential backoff.
 */

import CONFIG from './config.js';
import { setState } from './state.js';

let ws = null;
let reconnectTimer = null;
let reconnectDelay = CONFIG.WS_RECONNECT_DELAY;
let intentionallyClosed = false;

/**
 * Connect to the WebSocket server.
 */
export function connectWebSocket() {
  if (CONFIG.MOCK_MODE) {
    console.log('[WS] Mock mode — skipping WebSocket connection');
    setState({ connectionState: 'CONNECTED' });
    return;
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  intentionallyClosed = false;
  setState({ connectionState: 'CONNECTING' });
  console.log('[WS] Connecting to', CONFIG.WS_URL);

  try {
    ws = new WebSocket(CONFIG.WS_URL);
  } catch (err) {
    console.error('[WS] Connection error:', err);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[WS] Connected');
    setState({ connectionState: 'CONNECTED' });
    reconnectDelay = CONFIG.WS_RECONNECT_DELAY; // reset backoff
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch (err) {
      console.error('[WS] Failed to parse message:', err);
    }
  };

  ws.onclose = (event) => {
    console.log('[WS] Disconnected', event.code, event.reason);
    ws = null;
    if (!intentionallyClosed) {
      setState({ connectionState: 'DISCONNECTED' });
      scheduleReconnect();
    }
  };

  ws.onerror = (err) => {
    console.error('[WS] Error:', err);
  };
}

/**
 * Disconnect WebSocket intentionally.
 */
export function disconnectWebSocket() {
  intentionallyClosed = true;
  clearTimeout(reconnectTimer);
  if (ws) {
    ws.close();
    ws = null;
  }
  setState({ connectionState: 'DISCONNECTED' });
}

/**
 * Send a message over WebSocket.
 * @param {object} data
 */
export function sendMessage(data) {
  if (CONFIG.MOCK_MODE) {
    console.log('[WS] Mock send:', data);
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  } else {
    console.warn('[WS] Not connected, cannot send:', data);
  }
}

/**
 * Schedule a reconnection attempt with exponential backoff.
 */
function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  console.log(`[WS] Reconnecting in ${reconnectDelay}ms...`);
  setState({ connectionState: 'CONNECTING' });

  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(
      reconnectDelay * CONFIG.WS_RECONNECT_BACKOFF,
      CONFIG.WS_MAX_RECONNECT_DELAY
    );
    connectWebSocket();
  }, reconnectDelay);
}

/**
 * Handle incoming WebSocket messages and update state.
 * @param {object} data
 */
function handleMessage(data) {
  console.log('[WS] Received:', data);

  switch (data.type) {
    case 'security_state':
      setState({ securityState: data.state });
      break;

    case 'movement_detected':
      setState({
        lastActivity: {
          message: 'Movement detected',
          timestamp: data.timestamp,
        },
      });
      break;

    case 'alarm':
      if (data.active) {
        setState({
          securityState: 'ALARM',
          alarmActive: true,
          lastActivity: {
            message: 'Movement detected',
            timestamp: data.timestamp,
          },
        });
      } else {
        setState({
          securityState: 'OFF',
          alarmActive: false,
        });
      }
      break;

    case 'device_status':
      setState({
        connectionState: data.status === 'ONLINE' ? 'CONNECTED' : 'DISCONNECTED',
      });
      break;

    default:
      console.warn('[WS] Unknown message type:', data.type);
  }
}
