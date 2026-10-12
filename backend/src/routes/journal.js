/**
 * CycleGuard Backend — Journal & Security Coach Routes
 * Activity Journal, Event History, Parking Confirmation, and ML-powered Security Coach.
 */

const express = require('express');
const config = require('../config');
const eventService = require('../eventService');
const securityCoach = require('../securityCoach');
const mockDataLoader = require('../mockDataLoader');

const router = express.Router();

/**
 * GET /api/device/:deviceId/events
 * Query persistent event history with filters.
 */
router.get('/:deviceId/events', (req, res) => {
  const { deviceId } = req.params;
  const { from, to, type, source, limit, offset } = req.query;

  // Input validation
  if (deviceId && !/^[\w-]{1,32}$/.test(deviceId)) {
    return res.status(400).json({ success: false, error: 'Invalid device ID format.' });
  }

  if (from && isNaN(Date.parse(from))) {
    return res.status(400).json({ success: false, error: 'Invalid "from" date format. Use ISO-8601.' });
  }

  if (to && isNaN(Date.parse(to))) {
    return res.status(400).json({ success: false, error: 'Invalid "to" date format. Use ISO-8601.' });
  }

  if (limit && (isNaN(limit) || parseInt(limit, 10) < 1)) {
    return res.status(400).json({ success: false, error: 'Invalid "limit" parameter.' });
  }

  try {
    const result = eventService.getEvents({
      deviceId,
      from: from || null,
      to: to || null,
      type: type || null,
      source: source || 'all',
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
    });

    res.json({
      success: true,
      ...result,
      demoModeActive: !!config.demoMode,
    });
  } catch (err) {
    console.error('[Journal] Error fetching events:', err.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve events.' });
  }
});

/**
 * GET /api/device/:deviceId/journal/summary
 * Today's activity summary for the journal view.
 */
router.get('/:deviceId/journal/summary', (req, res) => {
  const { deviceId } = req.params;
  const { date } = req.query;

  if (deviceId && !/^[\w-]{1,32}$/.test(deviceId)) {
    return res.status(400).json({ success: false, error: 'Invalid device ID format.' });
  }

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  try {
    const summary = eventService.getJournalSummary(deviceId, date || null);
    res.json({
      success: true,
      ...summary,
    });
  } catch (err) {
    console.error('[Journal] Error generating summary:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate journal summary.' });
  }
});

/**
 * POST /api/device/:deviceId/journal/confirm-parking
 * Record a user-confirmed parking event. This is ground-truth data for future learning.
 */
router.post('/:deviceId/journal/confirm-parking', (req, res) => {
  const { deviceId } = req.params;

  if (deviceId && !/^[\w-]{1,32}$/.test(deviceId)) {
    return res.status(400).json({ success: false, error: 'Invalid device ID format.' });
  }

  try {
    const event = eventService.recordEvent({
      deviceId,
      type: 'PARKING_CONFIRMED',
      source: 'user_confirmed',
      origin: 'web',
      message: 'User confirmed bicycle is parked',
      details: {
        confirmedAt: new Date().toISOString(),
        clientIp: req.ip,
      },
    });

    if (!event) {
      return res.status(429).json({
        success: false,
        error: 'Duplicate parking confirmation. Please wait before confirming again.',
      });
    }

    res.json({
      success: true,
      message: 'Parking confirmed and recorded.',
      event,
    });
  } catch (err) {
    console.error('[Journal] Error confirming parking:', err.message);
    res.status(500).json({ success: false, error: 'Failed to record parking confirmation.' });
  }
});

/**
 * GET /api/device/:deviceId/security-coach
 * Get ML-powered security recommendations with rule-based fallback.
 */
router.get('/:deviceId/security-coach', async (req, res) => {
  const { deviceId } = req.params;

  if (deviceId && !/^[\w-]{1,32}$/.test(deviceId)) {
    return res.status(400).json({ success: false, error: 'Invalid device ID format.' });
  }

  try {
    const result = await securityCoach.getRecommendations(deviceId);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[Coach] Error generating recommendations:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate security recommendations.' });
  }
});

/**
 * GET /api/device/:deviceId/schedule
 * Get the parsed timetable schedule (demo data).
 */
router.get('/:deviceId/schedule', (req, res) => {
  const { deviceId } = req.params;

  if (!config.demoMode) {
    return res.json({
      success: true,
      schedule: [],
      message: 'Schedule data is only available in demo mode.',
      demoModeActive: false,
    });
  }

  const timetable = mockDataLoader.getTimetable();
  const routines = mockDataLoader.getRoutines();

  res.json({
    success: true,
    deviceId,
    schedule: timetable,
    routines,
    demoModeActive: true,
  });
});

module.exports = router;
