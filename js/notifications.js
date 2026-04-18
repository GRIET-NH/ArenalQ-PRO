/**
 * @module notifications
 * @description Manages push notifications and in-app alerts for ArenaIQ.
 *
 * Wraps Firebase Cloud Messaging (FCM) for browser push delivery and
 * maintains a bounded in-memory alert queue for the ops dashboard.
 *
 * Extends `EventTarget` and emits:
 *   - `alert-added`       — when a new alert is queued
 *   - `alert-acknowledged`— when an alert is marked resolved
 *   - `alerts-cleared`    — when the queue is emptied
 */

/** @typedef {'info' | 'warning' | 'critical'} AlertSeverity */

/**
 * @typedef {object} VenueAlert
 * @property {string}        id           - Unique alert ID
 * @property {AlertSeverity} severity
 * @property {string}        title        - Short summary (≤ 120 chars)
 * @property {string}        body         - Detail text (≤ 500 chars)
 * @property {string}        zoneId       - Zone that triggered the alert
 * @property {number}        timestamp    - Unix ms
 * @property {boolean}       acknowledged - True once resolved
 */

const VALID_SEVERITIES = new Set(['info', 'warning', 'critical']);

/** Severity sort order for `getActiveAlerts`. */
const SEVERITY_ORDER = Object.freeze({ critical: 0, warning: 1, info: 2 });

let _alertIdCounter = 0;

/**
 * Generates a unique, time-sortable alert ID.
 * @returns {string}
 */
function generateAlertId() {
  return `alert-${Date.now()}-${++_alertIdCounter}`;
}

export class NotificationService extends EventTarget {
  /**
   * @param {object} [options]
   * @param {number} [options.maxQueueSize=100]  - Soft cap on alerts kept in memory
   * @param {number} [options.autoDismissMs=0]   - Auto-dismiss 'info' alerts after N ms (0 = never)
   */
  constructor({ maxQueueSize = 100, autoDismissMs = 0 } = {}) {
    super();
    this._maxQueueSize = maxQueueSize;
    this._autoDismissMs = autoDismissMs;
    /** @type {VenueAlert[]} */
    this._queue = [];
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    this._dismissTimers = new Map();
  }

  /**
   * Adds a new alert to the queue and emits `alert-added`.
   * Input is validated and sanitised before storage.
   *
   * @param {object}        params
   * @param {AlertSeverity} params.severity
   * @param {string}        params.title
   * @param {string}        [params.body='']
   * @param {string}        [params.zoneId='venue']
   * @returns {VenueAlert}  The created alert with full metadata
   */
  addAlert({ severity, title, body = '', zoneId = 'venue' }) {
    if (!VALID_SEVERITIES.has(severity)) {
      throw new TypeError(
        `severity must be one of ${[...VALID_SEVERITIES].join(', ')}, received "${severity}"`
      );
    }
    if (!String(title).trim()) {
      throw new TypeError('Alert title must not be empty');
    }

    /** @type {VenueAlert} */
    const alert = {
      id: generateAlertId(),
      severity,
      title: String(title).slice(0, 120),
      body: String(body).slice(0, 500),
      zoneId: String(zoneId),
      timestamp: Date.now(),
      acknowledged: false,
    };

    // Enforce queue size — FIFO: drop oldest when at capacity
    this._queue.push(alert);
    if (this._queue.length > this._maxQueueSize) {
      this._queue.shift();
    }

    this.dispatchEvent(new CustomEvent('alert-added', { detail: alert }));

    if (this._autoDismissMs > 0 && severity === 'info') {
      const timer = setTimeout(() => this.acknowledge(alert.id), this._autoDismissMs);
      this._dismissTimers.set(alert.id, timer);
    }

    return alert;
  }

  /**
   * Marks an alert as acknowledged and emits `alert-acknowledged`.
   * @param {string} alertId
   * @returns {boolean} `true` if the alert was found and updated
   */
  acknowledge(alertId) {
    const alert = this._queue.find((a) => a.id === alertId);
    if (!alert) return false;

    alert.acknowledged = true;

    const timer = this._dismissTimers.get(alertId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this._dismissTimers.delete(alertId);
    }

    this.dispatchEvent(new CustomEvent('alert-acknowledged', { detail: alert }));
    return true;
  }

  /**
   * Returns unacknowledged alerts sorted by severity (critical first),
   * then by most-recent timestamp.
   * @returns {VenueAlert[]}
   */
  getActiveAlerts() {
    return this._queue
      .filter((a) => !a.acknowledged)
      .sort(
        (a, b) =>
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.timestamp - a.timestamp
      );
  }

  /**
   * Clears all alerts and their auto-dismiss timers.
   * Emits `alerts-cleared`.
   */
  clearAll() {
    this._dismissTimers.forEach((timer) => clearTimeout(timer));
    this._dismissTimers.clear();
    this._queue = [];
    this.dispatchEvent(new CustomEvent('alerts-cleared'));
  }
}
