/**
 * @module queue-predictor
 * @description Predicts zone queue wait times using Holt's Double Exponential
 * Smoothing (level + trend).  This lightweight model runs client-side as a
 * fast approximation ahead of the authoritative LSTM forecaster running on
 * the ArenaIQ ML serving layer.  It targets <200 ms prediction latency for
 * dashboard and fan-app rendering.
 */

/**
 * @typedef {'low' | 'medium' | 'high' | 'critical'} RiskLevel
 */

/**
 * @typedef {object} QueueForecast
 * @property {string}    zoneId                 - Zone identifier
 * @property {number}    predictedWaitMinutes   - Predicted wait at horizon
 * @property {number}    trendMinutesPerUpdate  - Current trend (+ = growing)
 * @property {RiskLevel} riskLevel              - Risk classification
 * @property {number}    confidenceScore        - 0–1; grows with observations
 * @property {number}    updatedAt              - Unix timestamp ms
 */

/**
 * @typedef {object} ZoneState
 * @property {number} level        - Smoothed level (Holt L_t)
 * @property {number} trend        - Smoothed trend  (Holt T_t)
 * @property {number} observations - Number of updates received
 */

/**
 * Validates that `value` is a finite number within [min, max].
 * @param {unknown} value
 * @param {number}  min
 * @param {number}  max
 * @param {string}  name
 * @throws {RangeError}
 */
function assertRange(value, min, max, name) {
  if (typeof value !== 'number' || !isFinite(value) || value < min || value > max) {
    throw new RangeError(
      `${name} must be a finite number in [${min}, ${max}], received ${value}`
    );
  }
}

export class QueuePredictor {
  /**
   * @param {object} [options]
   * @param {number} [options.alpha=0.3]         - Level smoothing factor (0–1)
   * @param {number} [options.beta=0.1]          - Trend smoothing factor (0–1)
   * @param {number} [options.horizonMinutes=10] - Forecast horizon in minutes
   * @param {number} [options.maxWaitMinutes=120]- Upper cap for predictions
   */
  constructor({ alpha = 0.3, beta = 0.1, horizonMinutes = 10, maxWaitMinutes = 120 } = {}) {
    assertRange(alpha, 0, 1, 'alpha');
    assertRange(beta, 0, 1, 'beta');
    assertRange(horizonMinutes, 1, 120, 'horizonMinutes');
    assertRange(maxWaitMinutes, 1, 480, 'maxWaitMinutes');

    this.alpha = alpha;
    this.beta = beta;
    this.horizonMinutes = horizonMinutes;
    this.maxWaitMinutes = maxWaitMinutes;

    /** @type {Map<string, ZoneState>} */
    this._states = new Map();
  }

  /**
   * Updates a zone's state with a new observation and returns a forecast.
   * @param {string} zoneId               - Zone identifier (non-empty string)
   * @param {number} observedWaitMinutes  - Observed wait in minutes (≥ 0)
   * @returns {QueueForecast}
   */
  update(zoneId, observedWaitMinutes) {
    if (typeof zoneId !== 'string' || !zoneId.trim()) {
      throw new TypeError('zoneId must be a non-empty string');
    }
    assertRange(observedWaitMinutes, 0, this.maxWaitMinutes, 'observedWaitMinutes');

    const state = this._states.get(zoneId);
    let level, trend;

    if (!state) {
      // Initialise: first observation sets level; trend starts at zero
      level = observedWaitMinutes;
      trend = 0;
    } else {
      // Holt's double exponential smoothing update equations
      const prevLevel = state.level;
      const prevTrend = state.trend;
      level = this.alpha * observedWaitMinutes + (1 - this.alpha) * (prevLevel + prevTrend);
      trend = this.beta * (level - prevLevel) + (1 - this.beta) * prevTrend;
    }

    const observations = (state ? state.observations : 0) + 1;
    this._states.set(zoneId, { level, trend, observations });

    // Project forward by horizonMinutes steps
    const raw = level + this.horizonMinutes * trend;
    const predicted = Math.min(Math.max(0, raw), this.maxWaitMinutes);

    return {
      zoneId,
      predictedWaitMinutes: Math.round(predicted * 10) / 10,
      trendMinutesPerUpdate: Math.round(trend * 10) / 10,
      riskLevel: this._classifyRisk(predicted),
      confidenceScore: Math.min(1, observations / 10),
      updatedAt: Date.now(),
    };
  }

  /**
   * Returns the current smoothed state for a zone without updating it.
   * @param {string} zoneId
   * @returns {ZoneState | undefined}
   */
  getState(zoneId) {
    return this._states.get(zoneId);
  }

  /** Clears all tracked zone states. */
  reset() {
    this._states.clear();
  }

  /**
   * Classifies a predicted wait time into a risk level.
   * @param {number} waitMinutes
   * @returns {RiskLevel}
   * @private
   */
  _classifyRisk(waitMinutes) {
    if (waitMinutes < 5) return 'low';
    if (waitMinutes < 10) return 'medium';
    if (waitMinutes < 20) return 'high';
    return 'critical';
  }
}
