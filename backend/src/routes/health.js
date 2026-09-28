/**
 * CycleGuard Backend — Health Route
 */

const express = require('express');
const { isMqttConnected } = require('../mqtt');
const { getClientCount } = require('../websocket');

const router = express.Router();

router.get('/health', (req, res) => {
  const mqttConnected = isMqttConnected();
  const statusCode = mqttConnected ? 200 : 503;

  res.status(statusCode).json({
    status: mqttConnected ? 'ok' : 'degraded',
    service: 'cycleguard-backend',
    mqtt: mqttConnected,
    websocketClients: getClientCount(),
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

module.exports = router;
