/**
 * CycleGuard Backend — Security Coach Service
 * Timetable-aware, explainable security recommendations.
 *
 * Architecture:
 *   1. Attempts ML prediction via Python FastAPI microservice (ml/server.py)
 *   2. Falls back to deterministic rule engine if ML service is unavailable
 *   3. Generates human-readable advisory prompts — NEVER auto-arms/disarms hardware
 *
 * Safety Invariants:
 *   - NEVER automatically arm, disarm, or clear alarms
 *   - NEVER silence, delay, or suppress an alarm
 *   - Advisory prompts only
 */

const config = require('./config');
const stateManager = require('./stateManager');
const mockDataLoader = require('./mockDataLoader');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Human-readable recommendation templates
const ADVICE_TEMPLATES = {
  UNSECURED_ON_CAMPUS_RISK: {
    icon: 'alert',
    severity: 'warning',
    title: 'Bicycle may be unsecured on campus',
    messageTemplate: (ctx) =>
      ctx.currentClass
        ? `You have ${ctx.currentClass.activity} at ${ctx.currentClass.location} until ${ctx.currentClass.endTime}. If your bicycle is parked, consider arming security.`
        : `Your bicycle is currently disarmed. If it is parked in a public area, consider arming it.`,
    reason: (ctx) =>
      ctx.currentClass
        ? `Based on your class timetable: ${ctx.currentClass.activity} (${ctx.currentClass.startTime}–${ctx.currentClass.endTime})`
        : 'Device is currently disarmed',
    dataSource: 'Class Timetable + Device State',
  },
  DEPARTURE_REMINDER: {
    icon: 'bike',
    severity: 'info',
    title: 'Departure window approaching',
    messageTemplate: (ctx) =>
      `Your usual departure time is approaching (${ctx.departureTime || '08:00'}). Check your bicycle's security state before leaving.`,
    reason: () => 'Based on your usual departure routine',
    dataSource: 'User Routine Pattern',
  },
  RETURN_REMINDER: {
    icon: 'home',
    severity: 'info',
    title: 'Return window approaching',
    messageTemplate: (ctx) =>
      `Your usual return time is approaching (${ctx.returnTime || '16:30'}). Verify your bicycle's security state if parked.`,
    reason: () => 'Based on your usual return routine',
    dataSource: 'User Routine Pattern',
  },
  ALL_SAFE: {
    icon: 'check',
    severity: 'safe',
    title: 'No action needed',
    messageTemplate: () => 'Your bicycle security status looks good. No recommendations at this time.',
    reason: () => 'Current state and schedule indicate no risk',
    dataSource: 'Device State + Schedule Analysis',
  },
};

class SecurityCoach {
  constructor() {
    this.mlAvailable = false;
    this.lastMLCheck = 0;
    this.mlCheckInterval = 30000; // Re-check ML availability every 30s
  }

  /**
   * Get current security recommendations for a device.
   * @param {string} deviceId
   * @returns {Promise<object>}
   */
  async getRecommendations(deviceId = config.defaultDeviceId) {
    const now = new Date();
    const dayName = DAYS[now.getDay()];
    const dayIndex = now.getDay(); // 0=Sunday ... 6=Saturday
    // Convert to ML-compatible day (0=Monday..6=Sunday)
    const mlDayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
    const hour = now.getHours();
    const minute = now.getMinutes();
    const minuteOfDay = hour * 60 + minute;

    // Get device state
    const device = stateManager.getDevice(deviceId);
    const securityState = device.securityState; // 'OFF' | 'ON' | 'ALARM'
    const securityStateCode = securityState === 'ON' ? 1 : securityState === 'ALARM' ? 2 : 0;

    // Load fixtures
    const timetable = mockDataLoader.getTimetable();
    const routines = mockDataLoader.getRoutines();

    // Find current class window
    const currentClass = timetable.find((slot) => {
      if (slot.dayOfWeek !== dayName) return false;
      const slotStart = parseTimeToMinutes(slot.startTime);
      const slotEnd = parseTimeToMinutes(slot.endTime);
      return minuteOfDay >= slotStart && minuteOfDay <= slotEnd;
    });

    // Find next upcoming class today
    const nextClass = timetable
      .filter((slot) => {
        if (slot.dayOfWeek !== dayName) return false;
        const slotStart = parseTimeToMinutes(slot.startTime);
        return slotStart > minuteOfDay;
      })
      .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime))[0];

    // Parse routine hints
    const departureRoutine = routines.find((r) => r.routineKey && r.routineKey.includes('leave'));
    const returnRoutine = routines.find((r) => r.routineKey && r.routineKey.includes('return'));
    const departureTime = departureRoutine ? departureRoutine.usualTime : '08:00';
    const returnTime = returnRoutine ? returnRoutine.usualTime : '16:30';

    // Check parking (from eventService — but don't import circular; passed by router)
    const parkingConfirmed = 0; // Default; actual value passed from route handler

    const context = {
      currentClass: currentClass || null,
      nextClass: nextClass || null,
      dayName,
      hour,
      minute,
      minuteOfDay,
      securityState,
      departureTime,
      returnTime,
      isInClassWindow: currentClass ? 1 : 0,
    };

    // Features for ML model
    const mlFeatures = {
      day_of_week: mlDayIndex,
      hour,
      minute,
      is_in_class_window: currentClass ? 1 : 0,
      security_state: securityStateCode,
      parking_confirmed_today: parkingConfirmed,
    };

    // Try ML prediction first, then rule-based fallback
    let prediction = null;
    let engine = 'rule-based';

    if (config.ml.enabled) {
      prediction = await this.getMLPrediction(mlFeatures);
      if (prediction) {
        engine = 'ml-python-scikit-learn';
      }
    }

    // Fall back to rules if ML failed
    if (!prediction) {
      prediction = this.runRuleEngine(context, mlFeatures);
      engine = 'rule-based';
    }

    // Build recommendation response
    const template = ADVICE_TEMPLATES[prediction.prediction] || ADVICE_TEMPLATES.ALL_SAFE;
    const recommendations = [];

    if (prediction.prediction !== 'ALL_SAFE') {
      recommendations.push({
        id: `coach_${Date.now()}`,
        type: prediction.prediction,
        icon: template.icon,
        severity: template.severity,
        title: template.title,
        message: template.messageTemplate(context),
        reason: template.reason(context),
        dataSource: template.dataSource,
        confidence: prediction.confidence,
        isAdvisoryOnly: true,
        cannotControlHardware: true,
      });
    }

    // Priority: Add alarm alert recommendation if device is actively in alarm
    if (securityState === 'ALARM') {
      recommendations.unshift({
        id: `coach_alarm_${Date.now()}`,
        type: 'ACTIVE_ALARM',
        icon: 'alert',
        severity: 'warning',
        title: 'Active Security Alarm Triggered',
        message: 'Movement has been detected on your bicycle while armed. Please verify your bicycle immediately.',
        reason: 'Alarm buzzer is currently triggered',
        dataSource: 'Live Sensor Telemetry',
        confidence: 1.0,
        isAdvisoryOnly: true,
        cannotControlHardware: true,
      });
    }

    // Add contextual tips if device is armed and all is safe
    if (securityState === 'ON' && prediction.prediction === 'ALL_SAFE') {
      recommendations.push({
        id: `coach_safe_${Date.now()}`,
        type: 'ALL_SAFE',
        icon: 'check',
        severity: 'safe',
        title: 'Security Active & Protected',
        message: 'Your bicycle security is armed. You will be alerted immediately if movement is detected.',
        reason: 'Device is armed and monitoring',
        dataSource: 'Device State',
        confidence: 1.0,
        isAdvisoryOnly: true,
        cannotControlHardware: true,
      });
    }

    // Add actionable routine reminder if disarmed
    if (securityState === 'OFF' && prediction.prediction === 'ALL_SAFE') {
      recommendations.push({
        id: `coach_disarmed_${Date.now()}`,
        type: 'DISARMED_NOTICE',
        icon: 'info',
        severity: 'info',
        title: 'Bicycle is Disarmed',
        message: nextClass
          ? `Upcoming class today: ${nextClass.activity} at ${nextClass.startTime}. If you ride and park on campus, remember to arm your bicycle.`
          : 'Your bicycle security is currently disarmed. If parked in a shared or public rack, consider arming security.',
        reason: 'Security is disarmed outside scheduled class hours',
        dataSource: 'Routine Schedule + Device State',
        confidence: 0.98,
        isAdvisoryOnly: true,
        cannotControlHardware: true,
      });
    }

    // Schedule context card
    const scheduleContext = {
      currentActivity: currentClass ? {
        activity: currentClass.activity,
        location: currentClass.location,
        startTime: currentClass.startTime,
        endTime: currentClass.endTime,
      } : null,
      nextActivity: nextClass ? {
        activity: nextClass.activity,
        location: nextClass.location,
        startTime: nextClass.startTime,
        endTime: nextClass.endTime,
      } : null,
      dayOfWeek: dayName,
      totalClassesToday: timetable.filter((s) => s.dayOfWeek === dayName).length,
    };

    return {
      deviceId,
      timestamp: now.toISOString(),
      engine,
      modelVersion: prediction.modelVersion || '1.0.0',
      prediction: {
        label: prediction.prediction,
        confidence: prediction.confidence,
        riskScore: prediction.risk_score || 0,
      },
      recommendations,
      scheduleContext,
      deviceState: {
        securityState,
        connectionState: device.connectionState,
      },
      demoModeActive: !!config.demoMode,
      disclaimer: 'These are advisory recommendations only. They cannot and do not control your device hardware.',
    };
  }

  /**
   * Query the Python ML microservice for a prediction.
   * @param {object} features
   * @returns {Promise<object|null>}
   */
  async getMLPrediction(features) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.ml.timeoutMs);

      const response = await fetch(`${config.ml.apiUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`[Coach] ML API returned ${response.status}`);
        return null;
      }

      const result = await response.json();
      this.mlAvailable = true;
      this.lastMLCheck = Date.now();
      return result;
    } catch (err) {
      if (this.mlAvailable || Date.now() - this.lastMLCheck > this.mlCheckInterval) {
        console.warn(`[Coach] ML API unavailable, using rule-based fallback: ${err.message}`);
        this.mlAvailable = false;
        this.lastMLCheck = Date.now();
      }
      return null;
    }
  }

  /**
   * Deterministic rule-based fallback engine.
   * @param {object} context
   * @param {object} features
   * @returns {object}
   */
  runRuleEngine(context, features) {
    const { securityState, isInClassWindow, minuteOfDay, departureTime, returnTime } = context;
    const depMinutes = parseTimeToMinutes(departureTime);
    const retMinutes = parseTimeToMinutes(returnTime);

    // Rule 1: Bicycle disarmed during class window
    if (securityState === 'OFF' && isInClassWindow) {
      return {
        prediction: 'UNSECURED_ON_CAMPUS_RISK',
        confidence: 0.95,
        risk_score: 0.95,
        modelVersion: 'rule-engine-v1',
      };
    }

    // Rule 2: Departure window (within 30 minutes) on weekday
    const dayIndex = features.day_of_week;
    if (dayIndex < 5 && securityState === 'OFF' && Math.abs(minuteOfDay - depMinutes) <= 30) {
      return {
        prediction: 'DEPARTURE_REMINDER',
        confidence: 0.85,
        risk_score: 0.3,
        modelVersion: 'rule-engine-v1',
      };
    }

    // Rule 3: Return window (within 30 minutes) on weekday
    if (dayIndex < 5 && Math.abs(minuteOfDay - retMinutes) <= 30) {
      return {
        prediction: 'RETURN_REMINDER',
        confidence: 0.80,
        risk_score: 0.2,
        modelVersion: 'rule-engine-v1',
      };
    }

    // Default: all safe
    return {
      prediction: 'ALL_SAFE',
      confidence: 1.0,
      risk_score: 0.0,
      modelVersion: 'rule-engine-v1',
    };
  }
}

/**
 * Parse "HH:MM" to minutes since midnight.
 */
function parseTimeToMinutes(timeStr) {
  try {
    const parts = String(timeStr).trim().split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  } catch {
    return 0;
  }
}

module.exports = new SecurityCoach();
