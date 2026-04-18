/**
 * @module dashboard
 * @description Operations command dashboard controller for ArenaIQ.
 *
 * Binds real-time `CrowdMonitor` zone events and `NotificationService`
 * alerts to DOM elements, maintaining a live view of venue status.
 *
 * Security note: all user-derived or API-derived strings are passed through
 * `escapeHtml` before being written into innerHTML to prevent XSS.
 */

import { announce } from './accessibility.js';
import { QueuePredictor } from './queue-predictor.js';

/**
 * Maps density level names to CSS modifier classes.
 * @type {Record<string, string>}
 */
const RISK_CLASSES = Object.freeze({
  normal: 'risk-normal',
  elevated: 'risk-elevated',
  high: 'risk-high',
  critical: 'risk-critical',
});

/**
 * Escapes HTML special characters to prevent XSS when rendering
 * untrusted strings via innerHTML.
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class Dashboard {
  /**
   * @param {object} options
   * @param {HTMLElement}  options.container     - Root element for the dashboard
   * @param {object}       options.crowdMonitor  - CrowdMonitor instance
   * @param {object}       options.notifications - NotificationService instance
   * @throws {TypeError} if container is not an HTMLElement
   */
  constructor({ container, crowdMonitor, notifications }) {
    if (!(container instanceof HTMLElement)) {
      throw new TypeError('Dashboard: container must be an HTMLElement');
    }
    this._container = container;
    this._crowdMonitor = crowdMonitor;
    this._notifications = notifications;
    // Scale density (0–1) to approx minutes for the queue predictor
    this._predictor = new QueuePredictor({ alpha: 0.35, beta: 0.12, horizonMinutes: 10 });
  }

  /**
   * Mounts the dashboard by attaching event listeners.
   * Call once after the DOM is ready.
   */
  mount() {
    this._crowdMonitor.addEventListener('zone-update', (e) => {
      this._renderZone(e.detail);
    });

    this._crowdMonitor.addEventListener('density-alert', (e) => {
      const zone = e.detail;
      this._notifications.addAlert({
        severity: zone.level === 'critical' ? 'critical' : 'warning',
        title: `${escapeHtml(zone.zoneName)} density alert`,
        body: `Density at ${Math.round(zone.density * 100)}% capacity`,
        zoneId: zone.zoneId,
      });
    });

    this._notifications.addEventListener('alert-added', (e) => {
      this._renderAlert(e.detail);
      const politeness = e.detail.severity === 'critical' ? 'assertive' : 'polite';
      announce(`${e.detail.severity.toUpperCase()}: ${e.detail.title}`, politeness);
    });
  }

  /**
   * Renders or updates a zone density card inside `.zone-grid`.
   * @param {import('./crowd-monitor.js').ZoneDensity} zone
   * @private
   */
  _renderZone(zone) {
    const forecast = this._predictor.update(zone.zoneId, zone.density * 15);
    const cardId = `zone-${zone.zoneId}`;

    let card = this._container.querySelector(`#${CSS.escape(cardId)}`);

    if (!card) {
      card = document.createElement('article');
      card.id = cardId;
      card.className = 'zone-card';
      card.setAttribute('role', 'listitem');
      const grid = this._container.querySelector('.zone-grid');
      if (grid) grid.appendChild(card);
    }

    const riskClass = RISK_CLASSES[zone.level] ?? RISK_CLASSES.normal;
    card.className = `zone-card ${riskClass}`;
    card.setAttribute('aria-label', `${escapeHtml(zone.zoneName)}: ${zone.level} density`);

    card.innerHTML = `
      <div class="zone-card__header">
        <span class="zone-card__name">${escapeHtml(zone.zoneName)}</span>
        <span class="zone-card__badge zone-card__badge--${escapeHtml(zone.level)}">${escapeHtml(zone.level)}</span>
      </div>
      <div class="zone-card__bar-wrap" aria-hidden="true">
        <div class="zone-card__bar" style="width:${Math.round(zone.density * 100)}%"></div>
      </div>
      <dl class="zone-card__stats">
        <dt>Occupancy</dt>
        <dd>${zone.estimatedOccupancy.toLocaleString()} / ${zone.capacity.toLocaleString()}</dd>
        <dt>Predicted wait</dt>
        <dd>${forecast.predictedWaitMinutes} min</dd>
      </dl>
    `;
  }

  /**
   * Prepends an alert card to `.alert-feed`, capped at 20 items.
   * @param {import('./notifications.js').VenueAlert} alert
   * @private
   */
  _renderAlert(alert) {
    const feed = this._container.querySelector('.alert-feed');
    if (!feed) return;

    const item = document.createElement('li');
    item.className = `alert-item alert-item--${escapeHtml(alert.severity)}`;
    item.dataset.alertId = alert.id;

    item.innerHTML = `
      <strong class="alert-item__title">${escapeHtml(alert.title)}</strong>
      <span class="alert-item__body">${escapeHtml(alert.body)}</span>
      <time class="alert-item__time" datetime="${new Date(alert.timestamp).toISOString()}">
        ${new Date(alert.timestamp).toLocaleTimeString()}
      </time>
      <button
        class="alert-item__ack"
        aria-label="Acknowledge: ${escapeHtml(alert.title)}"
        data-alert-id="${escapeHtml(alert.id)}"
      >✓</button>
    `;

    item.querySelector('.alert-item__ack').addEventListener('click', () => {
      this._notifications.acknowledge(alert.id);
      item.remove();
    });

    feed.prepend(item);

    // Limit rendered items to keep the DOM lean
    const items = feed.querySelectorAll('.alert-item');
    if (items.length > 20) items[items.length - 1].remove();
  }
}
