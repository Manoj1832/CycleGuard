/**
 * CycleGuard Backend — Learning Service
 * Clean interface boundary for future ML personalization.
 *
 * This module:
 *   - Provides a data export pipeline for eligible ground-truth events
 *   - Strictly filters out mock, predicted, and unconsented data
 *   - Does NOT train models or make predictions (deferred to future iteration)
 *   - Learning is disabled by default (CYCLEGUARD_LEARNING_CONSENT=false)
 */

const config = require('./config');
const eventService = require('./eventService');

class LearningService {
  constructor() {
    this.enabled = config.learningConsent;
  }

  /**
   * Check if learning data collection is permitted.
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get events eligible for future ML training.
   * Strict filters:
   *   - ONLY source: 'real' or 'user_confirmed'
   *   - NEVER source: 'mock'
   *   - NEVER predictions, recommendations, or schedule entries
   *   - Respects consent flag
   *
   * @param {string} deviceId
   * @param {object} options
   * @returns {{ eligible: boolean, reason: string, events?: Array }}
   */
  getEligibleLearningEvents(deviceId = config.defaultDeviceId, options = {}) {
    if (!this.enabled) {
      return {
        eligible: false,
        reason: 'Learning data collection is disabled. Set CYCLEGUARD_LEARNING_CONSENT=true to enable.',
        events: [],
      };
    }

    const { from = null, to = null, limit = 500 } = options;

    // Fetch only real events
    const realEvents = eventService.getEvents({
      deviceId,
      source: 'real',
      from,
      to,
      limit,
    }).events;

    // Fetch user-confirmed events
    const confirmedEvents = eventService.getEvents({
      deviceId,
      source: 'user_confirmed',
      from,
      to,
      limit,
    }).events;

    // Merge and deduplicate by eventId
    const seen = new Set();
    const merged = [];
    for (const evt of [...realEvents, ...confirmedEvents]) {
      if (!seen.has(evt.eventId)) {
        seen.add(evt.eventId);
        merged.push(evt);
      }
    }

    // Sort by occurredAt descending
    merged.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return {
      eligible: true,
      reason: 'Learning data collection is active. Only real and user-confirmed events are included.',
      totalEvents: merged.length,
      events: merged,
      metadata: {
        consentEnabled: true,
        mockDataExcluded: true,
        predictionsExcluded: true,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Get learning status summary.
   */
  getStatus() {
    return {
      learningEnabled: this.enabled,
      consentSetting: 'CYCLEGUARD_LEARNING_CONSENT',
      consentValue: this.enabled ? 'true' : 'false',
      description: this.enabled
        ? 'Learning data pipeline is active. Real and user-confirmed events are eligible for future model training.'
        : 'Learning is disabled by default. No data is being collected for training.',
      // TODO: Add user-facing consent toggle in settings UI
      todo: 'Implement user-facing consent toggle and privacy notice before enabling automatic data collection.',
    };
  }
}

module.exports = new LearningService();
