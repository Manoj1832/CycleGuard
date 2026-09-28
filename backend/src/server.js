/**
 * CycleGuard Backend — Main Server
 * Express + WebSocket + MQTT entry point.
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { connectMqtt, disconnectMqtt } = require('./mqtt');
const { initWebSocket } = require('./websocket');

// Routes
const healthRoutes = require('./routes/health');
const deviceRoutes = require('./routes/device');
const securityRoutes = require('./routes/security');
const authRoutes = require('./routes/auth');

// ---- Express App ----
const app = express();

// Security headers (permit WebSockets and fonts)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"],
      styleSrc: ["'self'", "https:", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'self'"],
    },
  },
}));

// CORS
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests from mobile devices on local network, localhost, or configured origins
    callback(null, true);
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Body parsing
app.use(express.json({ limit: '10kb' }));

// ---- Routes ----
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/device', securityRoutes);

// ---- Serve Frontend Static Files ----
const path = require('path');
app.use(express.static(path.join(__dirname, '../../frontend')));

// Fallback to index.html for SPA routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// 404 handler for API
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ---- HTTP Server ----
const server = http.createServer(app);

// ---- Initialize WebSocket ----
initWebSocket(server);

// ---- Connect MQTT ----
connectMqtt();

// ---- Start Server ----
const PORT = config.port;
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('==========================================');
  console.log('  CycleGuard Backend');
  console.log('==========================================');
  console.log(`  Environment : ${config.nodeEnv}`);
  console.log(`  HTTP        : http://0.0.0.0:${PORT}`);
  console.log(`  WebSocket   : ws://0.0.0.0:${PORT}/ws`);
  console.log(`  Health      : http://localhost:${PORT}/api/health`);
  console.log(`  MQTT Broker : ${config.mqtt.host}:${config.mqtt.port}`);
  console.log('==========================================');
  console.log('');
});

// ---- Graceful Shutdown ----
async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);

  // Close HTTP server
  server.close(() => {
    console.log('[Server] HTTP server closed');
  });

  // Disconnect MQTT
  await disconnectMqtt();

  // Exit
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
