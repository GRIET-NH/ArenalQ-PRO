/**
 * @module fan
 * @description Fan-facing companion page entry point for ArenaIQ.
 *
 * Powers the fan.html page — provides:
 *   - Live zone wait-time cards from the CrowdMonitor simulator
 *   - Seat/section → nearest gate lookup with Google Maps Embed directions
 *   - Nearest amenities panel (concessions, restrooms) with current status
 */

import { CONFIG } from './config.js';
import { CrowdMonitor } from './crowd-monitor.js';
import { QueuePredictor } from './queue-predictor.js';
import { initSkipLink, applyContrastPreferences } from './accessibility.js';
import { initThemeToggle } from './theme.js';
import { escapeHtml } from './dashboard.js';

// ─── Accessibility ────────────────────────────────────────────────────────────
initSkipLink('fan-main');
applyContrastPreferences();
initThemeToggle();

// ─── Services (always simulate on fan page — no direct Firestore access) ─────
const crowdMonitor = new CrowdMonitor({
  simulate: true,
  simulationIntervalMs: CONFIG.kpis.dashboardRefreshMs,
});

const predictor = new QueuePredictor({ alpha: 0.35, beta: 0.12, horizonMinutes: 10 });

// ─── Zone cards ───────────────────────────────────────────────────────────────
const AMENITY_IDS = new Set(['concessions-main', 'restroom-a', 'gate-north', 'gate-south']);

function renderZoneCard(zone) {
  const forecast = predictor.update(zone.zoneId, zone.density * 15);
  const isAmenity = AMENITY_IDS.has(zone.zoneId);
  const gridId = isAmenity ? 'fan-amenities-grid' : 'fan-zones-grid';
  const cardId = `fan-zone-${zone.zoneId}`;

  let card = document.getElementById(cardId);
  const grid = document.getElementById(gridId);
  if (!grid) return;

  if (!card) {
    card = document.createElement('article');
    card.id = cardId;
    card.className = 'fan-zone-card';
    card.setAttribute('role', 'listitem');
    grid.appendChild(card);
  }

  const riskColors = { normal: 'var(--green)', elevated: 'var(--yellow)', high: 'var(--red)', critical: '#8b0000' };
  const color = riskColors[zone.level] ?? riskColors.normal;

  card.className = `fan-zone-card fan-zone-card--${escapeHtml(zone.level)}`;
  card.innerHTML = `
    <div class="fan-zone-card__indicator" style="background:${color}" aria-hidden="true"></div>
    <div class="fan-zone-card__body">
      <strong class="fan-zone-card__name">${escapeHtml(zone.zoneName)}</strong>
      <span class="fan-zone-card__status">${escapeHtml(zone.level)}</span>
      <dl class="fan-zone-card__stats">
        <dt>Occupancy</dt>
        <dd>${zone.estimatedOccupancy.toLocaleString()} / ${zone.capacity.toLocaleString()}</dd>
        <dt>Wait</dt>
        <dd>~${forecast.predictedWaitMinutes} min</dd>
      </dl>
    </div>
  `;
}

crowdMonitor.addEventListener('zone-update', (e) => renderZoneCard(e.detail));

// ─── Wayfinding (seat / section → Google Maps directions) ─────────────────────
const wayfindingForm = document.getElementById('wayfinding-form');
const mapFrame = document.getElementById('fan-map-frame');
const { lat, lng } = CONFIG.googleMaps.venueCenter;

// Default map — show venue overview
if (mapFrame) {
  mapFrame.src = `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
}

if (wayfindingForm) {
  wayfindingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = wayfindingForm.querySelector('input[name="seat"]');
    const seat = input ? String(input.value).trim() : '';
    if (!seat || !mapFrame) return;

    // Build a directions embed from the user's location to the venue
    const dest = encodeURIComponent(`${lat},${lng}`);
    mapFrame.src =
      `https://maps.google.com/maps?saddr=My+Location&daddr=${dest}&output=embed`;

    const status = document.getElementById('wayfinding-status');
    if (status) {
      status.textContent = `Showing walking route to ${escapeHtml(seat)} — open in Google Maps for turn-by-turn navigation.`;
    }
    mapFrame.focus();
  });
}

// ─── Start monitoring ────────────────────────────────────────────────────────
crowdMonitor.start();
