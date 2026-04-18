/**
 * @module main
 * @description ArenaIQ application entry point.
 *
 * Wires together configuration, services, the live operations dashboard,
 * and optional Google Maps venue map.  Runs only when the DOM is ready.
 */

import { CONFIG } from './config.js';
import { CrowdMonitor } from './crowd-monitor.js';
import { NotificationService } from './notifications.js';
import { Dashboard } from './dashboard.js';
import { VenueMap } from './venue-map.js';
import { SimulatedVenueMap } from './simulated-venue-map.js';
import { initSkipLink, applyContrastPreferences } from './accessibility.js';

// ─── Accessibility ────────────────────────────────────────────────────────────
initSkipLink('main-content');
applyContrastPreferences();

// ─── Services ────────────────────────────────────────────────────────────────
const crowdMonitor = new CrowdMonitor({
  simulate: CONFIG.features.simulationMode,
  simulationIntervalMs: CONFIG.kpis.dashboardRefreshMs,
});

const notifications = new NotificationService({
  maxQueueSize: 50,
  // Auto-dismiss info alerts after 15 s in simulation; never in production
  autoDismissMs: CONFIG.features.simulationMode ? 15_000 : 0,
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
const dashboardEl = document.getElementById('live-dashboard');
if (dashboardEl) {
  const dashboard = new Dashboard({ container: dashboardEl, crowdMonitor, notifications });
  dashboard.mount();
}

// ─── Venue Map ────────────────────────────────────────────────────────────────
const mapEl = document.getElementById('venue-map');
if (mapEl && CONFIG.features.enableVenueMap) {
  const venueMap = new VenueMap({
    container: mapEl,
    apiKey: CONFIG.googleMaps.apiKey,
    center: CONFIG.googleMaps.venueCenter,
    crowdMonitor,
  });
  venueMap.init().catch((err) => {
    console.error('[ArenaIQ] Venue map initialisation failed:', err);
  });
} else if (mapEl) {
  // No Google Maps API key configured — render the SVG simulation map instead.
  const simMap = new SimulatedVenueMap({ container: mapEl, crowdMonitor });
  simMap.init();
}

// ─── Start live monitoring ────────────────────────────────────────────────────
crowdMonitor.start();
