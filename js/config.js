/**
 * @module config
 * @description Application configuration for ArenaIQ Smart Venue Platform.
 *
 * Sensitive values are injected at runtime via a server-rendered
 * `window.__ARENAIQ_CONFIG__` object — never hardcoded in source.
 * In local / CI environments without a Firebase project, the platform
 * automatically falls back to simulation mode.
 */

/** @type {Record<string, unknown>} */
const runtimeConfig = (typeof window !== 'undefined' && window.__ARENAIQ_CONFIG__) || {};

/**
 * @typedef {object} AppConfig
 * @property {object} firebase  - Firebase project settings
 * @property {object} googleMaps - Google Maps API settings
 * @property {object} features   - Feature flags
 * @property {object} kpis       - KPI thresholds used across the platform
 */

/** @type {AppConfig} */
export const CONFIG = Object.freeze({
  /** Firebase project configuration — all values come from runtime injection. */
  firebase: Object.freeze({
    apiKey: String(runtimeConfig.firebaseApiKey || ''),
    authDomain: String(runtimeConfig.authDomain || ''),
    projectId: String(runtimeConfig.projectId || ''),
    storageBucket: String(runtimeConfig.storageBucket || ''),
    messagingSenderId: String(runtimeConfig.messagingSenderId || ''),
    appId: String(runtimeConfig.appId || ''),
  }),

  /** Google Maps JavaScript API settings. */
  googleMaps: Object.freeze({
    apiKey: String(runtimeConfig.mapsApiKey || ''),
    venueCenter: Object.freeze({
      lat: Number(runtimeConfig.venueLat) || 40.7484,
      lng: Number(runtimeConfig.venueLng) || -73.9967,
    }),
  }),

  /** Runtime feature flags derived from available configuration. */
  features: Object.freeze({
    /** True when no Firebase config is available; uses built-in simulator. */
    simulationMode: !runtimeConfig.firebaseApiKey,
    enablePushNotifications: Boolean(runtimeConfig.fcmVapidKey),
    enableVenueMap: Boolean(runtimeConfig.mapsApiKey),
  }),

  /**
   * KPI thresholds that drive alert classification and SLA reporting.
   * Targets: 25% queue reduction, <60 s congestion detection, 99.9% uptime.
   */
  kpis: Object.freeze({
    /** Warn when predicted queue exceeds this value (minutes). */
    maxQueueMinutes: 15,
    /** Density ratio above which a zone triggers an alert. */
    crowdDensityAlertThreshold: 0.8,
    /** SLA: time from detection to alert emission (seconds). */
    incidentResponseTargetSeconds: 60,
    /** Dashboard polling interval in ms (target <2 s refresh). */
    dashboardRefreshMs: 2000,
  }),
});
