/**
 * CycleGuard Backend — Utilities
 * Shared helper functions.
 */

/**
 * Get a human-readable timestamp.
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Validate that a value is a non-empty string.
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Safe JSON parse with fallback.
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = { timestamp, isNonEmptyString, safeJsonParse };
