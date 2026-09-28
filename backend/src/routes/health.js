/**
 * CycleGuard Backend — Health Route
 */

const express = require('express');
const { isMqttConnected } = require('../mqtt');
const { getClientCount } = require('../websocket');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cycleguard-backend',
    mqtt: isMqttConnected(),
    websocketClients: getClientCount(),
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

module.exports = router;
