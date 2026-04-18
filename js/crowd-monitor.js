/**
 * @module crowd-monitor
 * @description Real-time crowd density monitoring for ArenaIQ venue zones.
 *
 * Subscribes to Firebase Firestore for live updates when a `firebaseService`
 * is provided, or runs a built-in physics-based simulator otherwise.
 *
 * Extends `EventTarget` so dashboard and map components can subscribe
 * independently without tight coupling.  Emitted events:
 *   - `zone-update`    — every time any zone density changes
 *   - `density-alert`  — when a zone reaches 'high' or 'critical' level
 */

/**
 * @typedef {'normal' | 'elevated' | 'high' | 'critical'} DensityLevel
 */

/**
 * @typedef {object} ZoneDensity
 * @property {string}       zoneId             - Sanitized zone identifier
 * @property {string}       zoneName           - Human-readable zone name
 * @property {number}       density            - Normalized 0–1
 * @property {DensityLevel} level              - Risk classification
 * @property {number}       estimatedOccupancy - Estimated people count
 * @property {number}       capacity           - Zone maximum capacity
 * @property {number}       timestamp          - Unix ms
 */

/** Density ratios that define each risk tier. */
const DENSITY_THRESHOLDS = Object.freeze({
  normal: 0.6,
  elevated: 0.75,
  high: 0.9,
});

/** Zone definitions used by the built-in simulator. */
const SIMULATED_ZONES = Object.freeze([
  { id: 'gate-north', name: 'North Gate', capacity: 2000 },
  { id: 'gate-south', name: 'South Gate', capacity: 2000 },
  { id: 'concourse-a', name: 'Concourse A', capacity: 3000 },
  { id: 'concourse-b', name: 'Concourse B', capacity: 3000 },
  { id: 'concessions-main', name: 'Main Concessions', capacity: 500 },
  { id: 'restroom-a', name: 'Restroom Block A', capacity: 80 },
  { id: 'parking-p1', name: 'Parking P1', capacity: 1200 },
  { id: 'section-lower', name: 'Lower Bowl', capacity: 8000 },
]);

/**
 * Classifies a normalised density ratio into a risk level.
 * @param {number} density - 0–1
 * @returns {DensityLevel}
 */
export function classifyDensity(density) {
  if (density < DENSITY_THRESHOLDS.normal) return 'normal';
  if (density < DENSITY_THRESHOLDS.elevated) return 'elevated';
  if (density < DENSITY_THRESHOLDS.high) return 'high';
  return 'critical';
}

/**
 * Strips characters outside `[a-zA-Z0-9_-]` to prevent injection when zone
 * IDs are used in DOM IDs, CSS selectors, or Firestore document paths.
 * @param {unknown} id
 * @returns {string}
 */
export function sanitizeZoneId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '');
}

export class CrowdMonitor extends EventTarget {
  /**
   * @param {object}  [options]
   * @param {object}  [options.firebaseService]       - FirebaseService instance
   * @param {boolean} [options.simulate=false]        - Force simulation mode
   * @param {number}  [options.simulationIntervalMs=3000]
   */
  constructor({ firebaseService = null, simulate = false, simulationIntervalMs = 3000 } = {}) {
    super();
    this._firebaseService = firebaseService;
    this._simulate = simulate || !firebaseService;
    this._simulationIntervalMs = simulationIntervalMs;
    this._subscriptions = [];
    this._simulationTimer = null;

    /** @type {Map<string, ZoneDensity>} */
    this._zones = new Map();
  }

  /** Starts real-time monitoring (simulation or Firestore). */
  start() {
    if (this._simulate) {
      this._startSimulation();
    } else {
      this._subscribeFirestore();
    }
  }

  /** Stops all subscriptions and timers. */
  stop() {
    if (this._simulationTimer !== null) {
      clearInterval(this._simulationTimer);
      this._simulationTimer = null;
    }
    this._subscriptions.forEach((unsub) => unsub());
    this._subscriptions = [];
  }

  /**
   * Returns current density data for a zone.
   * @param {string} zoneId
   * @returns {ZoneDensity | undefined}
   */
  getZone(zoneId) {
    return this._zones.get(sanitizeZoneId(zoneId));
  }

  /**
   * Returns all current zone densities.
   * @returns {ZoneDensity[]}
   */
  getAllZones() {
    return Array.from(this._zones.values());
  }

  /**
   * Stores zone data and dispatches update/alert events.
   * Exposed (not truly private) so tests can inject synthetic zone data.
   * @param {ZoneDensity} zone
   */
  _emitZoneUpdate(zone) {
    this._zones.set(zone.zoneId, zone);
    this.dispatchEvent(new CustomEvent('zone-update', { detail: zone }));

    if (zone.level === 'high' || zone.level === 'critical') {
      this.dispatchEvent(new CustomEvent('density-alert', { detail: zone }));
    }
  }

  /**
   * Subscribes to the `zone-density` Firestore collection.
   * @private
   */
  _subscribeFirestore() {
    if (!this._firebaseService) return;

    const unsub = this._firebaseService.subscribeToCollection('zone-density', (snapshot) => {
      snapshot.forEach((doc) => {
        const data = doc.data();
        const density = Number(data.density ?? 0);
        this._emitZoneUpdate({
          zoneId: sanitizeZoneId(doc.id),
          zoneName: String(data.name ?? doc.id),
          density,
          level: classifyDensity(density),
          estimatedOccupancy: Math.round(Number(data.occupancy ?? 0)),
          capacity: Math.round(Number(data.capacity ?? 1000)),
          timestamp: Date.now(),
        });
      });
    });

    this._subscriptions.push(unsub);
  }

  /**
   * Runs a physics-based crowd simulation for demo / offline use.
   * Models a pre-event build-up, in-event steady state, and post-event exodus.
   * @private
   */
  _startSimulation() {
    const tick = () => {
      const now = Date.now();
      const d = new Date(now);
      const eventHour = d.getHours() + d.getMinutes() / 60;
      const baseLoad = this._getEventPhaseLoad(eventHour);

      SIMULATED_ZONES.forEach(({ id, name, capacity }) => {
        const prev = this._zones.get(id);
        const prevDensity = prev ? prev.density : baseLoad;

        // Random walk with mean-reversion toward the phase load
        const noise = (Math.random() - 0.5) * 0.08;
        const reversion = (baseLoad - prevDensity) * 0.15;
        const density = Math.min(1, Math.max(0, prevDensity + noise + reversion));

        this._emitZoneUpdate({
          zoneId: id,
          zoneName: name,
          density: Math.round(density * 100) / 100,
          level: classifyDensity(density),
          estimatedOccupancy: Math.round(density * capacity),
          capacity,
          timestamp: now,
        });
      });
    };

    // Execute first tick immediately so callers see data without waiting
    tick();
    this._simulationTimer = setInterval(tick, this._simulationIntervalMs);
  }

  /**
   * Maps the current hour to a base crowd load for the simulator.
   * Assumes a 19:00 event start with a 22:00 end.
   * @param {number} hour - 0–23.99
   * @returns {number} 0–1
   * @private
   */
  _getEventPhaseLoad(hour) {
    if (hour < 17) return 0.1;
    if (hour < 18) return 0.3;
    if (hour < 19) return 0.65;
    if (hour < 19.5) return 0.85;
    if (hour < 22) return 0.7;
    if (hour < 22.5) return 0.9;
    if (hour < 23) return 0.5;
    return 0.1;
  }
}
