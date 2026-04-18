import { CrowdMonitor, classifyDensity, sanitizeZoneId } from '../js/crowd-monitor.js';

// ── classifyDensity ────────────────────────────────────────────────────────────
describe('classifyDensity', () => {
  it.each([
    [0, 'normal'],
    [0.3, 'normal'],
    [0.599, 'normal'],
    [0.6, 'elevated'],
    [0.749, 'elevated'],
    [0.75, 'high'],
    [0.899, 'high'],
    [0.9, 'critical'],
    [1.0, 'critical'],
  ])('density %p → level %s', (density, expected) => {
    expect(classifyDensity(density)).toBe(expected);
  });
});

// ── sanitizeZoneId ─────────────────────────────────────────────────────────────
describe('sanitizeZoneId', () => {
  it('passes through valid alphanumeric identifiers', () => {
    expect(sanitizeZoneId('gate-north-01')).toBe('gate-north-01');
    expect(sanitizeZoneId('zone_A_3')).toBe('zone_A_3');
  });

  it('strips HTML / SQL injection characters', () => {
    expect(sanitizeZoneId('gate<script>alert(1)</script>')).toBe('gatescriptalert1script');
    // Hyphens are allowed; semicolons and quotes are stripped
    expect(sanitizeZoneId("zone'; DROP TABLE zones;--")).toBe('zoneDROPTABLEzones--');
  });

  it('strips spaces and special characters', () => {
    expect(sanitizeZoneId('north gate')).toBe('northgate');
    // @ and . are stripped; all letters remain
    expect(sanitizeZoneId('gate@venue.com')).toBe('gatevenuecom');
  });

  it('coerces non-string inputs', () => {
    expect(sanitizeZoneId(42)).toBe('42');
    expect(sanitizeZoneId(null)).toBe('null');
  });
});

// ── CrowdMonitor ───────────────────────────────────────────────────────────────
describe('CrowdMonitor', () => {
  let monitor;

  beforeEach(() => {
    jest.useFakeTimers();
    monitor = new CrowdMonitor({ simulate: true, simulationIntervalMs: 1000 });
  });

  afterEach(() => {
    monitor.stop();
    jest.useRealTimers();
  });

  // ── Initialisation ────────────────────────────────────────────────────────
  describe('constructor', () => {
    it('defaults to simulation when no firebaseService is provided', () => {
      expect(monitor._simulate).toBe(true);
    });

    it('uses Firestore when a firebaseService is provided', () => {
      const fake = { subscribeToCollection: jest.fn(() => jest.fn()) };
      const m = new CrowdMonitor({ firebaseService: fake });
      expect(m._simulate).toBe(false);
    });

    it('forces simulation when simulate:true even with a firebaseService', () => {
      const fake = {};
      const m = new CrowdMonitor({ firebaseService: fake, simulate: true });
      expect(m._simulate).toBe(true);
    });
  });

  // ── start / stop ──────────────────────────────────────────────────────────
  describe('start', () => {
    it('emits zone-update events immediately on start', () => {
      const handler = jest.fn();
      monitor.addEventListener('zone-update', handler);
      monitor.start();
      expect(handler).toHaveBeenCalled();
    });

    it('continues emitting after interval advances', () => {
      const handler = jest.fn();
      monitor.addEventListener('zone-update', handler);
      monitor.start();
      const countAfterStart = handler.mock.calls.length;
      jest.advanceTimersByTime(1000);
      expect(handler.mock.calls.length).toBeGreaterThan(countAfterStart);
    });

    it('emits zone-update events with the required shape', () => {
      const updates = [];
      monitor.addEventListener('zone-update', (e) => updates.push(e.detail));
      monitor.start();
      const zone = updates[0];
      expect(zone).toMatchObject({
        zoneId: expect.any(String),
        zoneName: expect.any(String),
        density: expect.any(Number),
        level: expect.stringMatching(/^(normal|elevated|high|critical)$/),
        estimatedOccupancy: expect.any(Number),
        capacity: expect.any(Number),
        timestamp: expect.any(Number),
      });
    });
  });

  describe('stop', () => {
    it('stops emitting after stop() is called', () => {
      const handler = jest.fn();
      monitor.addEventListener('zone-update', handler);
      monitor.start();
      monitor.stop();
      const countAfterStop = handler.mock.calls.length;
      jest.advanceTimersByTime(5000);
      expect(handler.mock.calls.length).toBe(countAfterStop);
    });

    it('clears the simulation timer reference', () => {
      monitor.start();
      monitor.stop();
      expect(monitor._simulationTimer).toBeNull();
    });
  });

  // ── density-alert ─────────────────────────────────────────────────────────
  describe('density-alert event', () => {
    it('fires for a critical zone', () => {
      const alertHandler = jest.fn();
      monitor.addEventListener('density-alert', alertHandler);
      monitor._emitZoneUpdate({
        zoneId: 'test',
        zoneName: 'Test',
        density: 0.95,
        level: 'critical',
        estimatedOccupancy: 950,
        capacity: 1000,
        timestamp: Date.now(),
      });
      expect(alertHandler).toHaveBeenCalledTimes(1);
    });

    it('fires for a high-density zone', () => {
      const alertHandler = jest.fn();
      monitor.addEventListener('density-alert', alertHandler);
      monitor._emitZoneUpdate({
        zoneId: 'test',
        zoneName: 'Test',
        density: 0.88,
        level: 'high',
        estimatedOccupancy: 880,
        capacity: 1000,
        timestamp: Date.now(),
      });
      expect(alertHandler).toHaveBeenCalledTimes(1);
    });

    it('does not fire for a normal zone', () => {
      const alertHandler = jest.fn();
      monitor.addEventListener('density-alert', alertHandler);
      monitor._emitZoneUpdate({
        zoneId: 'test',
        zoneName: 'Test',
        density: 0.3,
        level: 'normal',
        estimatedOccupancy: 300,
        capacity: 1000,
        timestamp: Date.now(),
      });
      expect(alertHandler).not.toHaveBeenCalled();
    });
  });

  // ── getZone / getAllZones ──────────────────────────────────────────────────
  describe('getZone / getAllZones', () => {
    it('getZone returns undefined before start', () => {
      expect(monitor.getZone('gate-north')).toBeUndefined();
    });

    it('getZone returns zone data after start', () => {
      monitor.start();
      const zones = monitor.getAllZones();
      expect(zones.length).toBeGreaterThan(0);
      expect(monitor.getZone(zones[0].zoneId)).toEqual(zones[0]);
    });

    it('sanitizes the zoneId passed to getZone', () => {
      monitor._emitZoneUpdate({
        zoneId: 'gate-a',
        zoneName: 'Gate A',
        density: 0.5,
        level: 'normal',
        estimatedOccupancy: 500,
        capacity: 1000,
        timestamp: Date.now(),
      });
      // Injection chars are stripped: 'gate-a<script>' → 'gate-ascript' (not found)
      // but a clean id lookup still works
      expect(monitor.getZone('gate-a')).toBeDefined();
      expect(monitor.getZone('gate-a<script>')).toBeUndefined();
    });
  });
});
