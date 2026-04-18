import { NotificationService } from '../js/notifications.js';

describe('NotificationService', () => {
  let svc;

  beforeEach(() => {
    jest.useFakeTimers();
    svc = new NotificationService();
  });

  afterEach(() => {
    svc.clearAll();
    jest.useRealTimers();
  });

  // ── addAlert ───────────────────────────────────────────────────────────────
  describe('addAlert', () => {
    it('returns an alert with generated id, timestamp, and acknowledged=false', () => {
      const alert = svc.addAlert({ severity: 'warning', title: 'Gate congestion', zoneId: 'gate-a' });
      expect(alert.id).toMatch(/^alert-\d+-\d+$/);
      expect(alert.acknowledged).toBe(false);
      expect(alert.timestamp).toBeGreaterThan(0);
    });

    it('emits alert-added event with the created alert as detail', () => {
      const handler = jest.fn();
      svc.addEventListener('alert-added', handler);
      svc.addAlert({ severity: 'info', title: 'System ready', zoneId: 'venue' });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].detail.severity).toBe('info');
    });

    it.each(['info', 'warning', 'critical'])('accepts severity "%s"', (severity) => {
      expect(() => svc.addAlert({ severity, title: 'Test', zoneId: 'a' })).not.toThrow();
    });

    it('throws TypeError for invalid severity', () => {
      expect(() => svc.addAlert({ severity: 'extreme', title: 'X', zoneId: 'a' })).toThrow(TypeError);
    });

    it('throws TypeError for empty title', () => {
      expect(() => svc.addAlert({ severity: 'info', title: '', zoneId: 'a' })).toThrow(TypeError);
    });

    it('throws TypeError for whitespace-only title', () => {
      expect(() => svc.addAlert({ severity: 'info', title: '   ', zoneId: 'a' })).toThrow(TypeError);
    });

    it('truncates title to 120 characters', () => {
      const alert = svc.addAlert({ severity: 'info', title: 'A'.repeat(200), zoneId: 'a' });
      expect(alert.title.length).toBeLessThanOrEqual(120);
    });

    it('truncates body to 500 characters', () => {
      const alert = svc.addAlert({ severity: 'info', title: 'T', body: 'B'.repeat(600), zoneId: 'a' });
      expect(alert.body.length).toBeLessThanOrEqual(500);
    });

    it('defaults body to empty string when omitted', () => {
      const alert = svc.addAlert({ severity: 'info', title: 'T', zoneId: 'a' });
      expect(alert.body).toBe('');
    });

    it('defaults zoneId to "venue" when omitted', () => {
      const alert = svc.addAlert({ severity: 'info', title: 'T' });
      expect(alert.zoneId).toBe('venue');
    });

    it('enforces maxQueueSize by dropping the oldest entry', () => {
      const small = new NotificationService({ maxQueueSize: 3 });
      for (let i = 0; i < 5; i++) {
        small.addAlert({ severity: 'info', title: `Alert ${i}`, zoneId: 'a' });
      }
      expect(small.getActiveAlerts().length).toBeLessThanOrEqual(3);
    });

    it('auto-dismisses info alerts after autoDismissMs', () => {
      const s = new NotificationService({ autoDismissMs: 5000 });
      const alert = s.addAlert({ severity: 'info', title: 'Temp', zoneId: 'a' });
      jest.advanceTimersByTime(5000);
      expect(s.getActiveAlerts().find((a) => a.id === alert.id)).toBeUndefined();
    });

    it('does NOT auto-dismiss warning or critical alerts', () => {
      const s = new NotificationService({ autoDismissMs: 5000 });
      const alert = s.addAlert({ severity: 'warning', title: 'Warn', zoneId: 'a' });
      jest.advanceTimersByTime(10000);
      expect(s.getActiveAlerts().find((a) => a.id === alert.id)).toBeDefined();
    });

    it('generates unique IDs for concurrent alerts', () => {
      const ids = new Set();
      for (let i = 0; i < 20; i++) {
        ids.add(svc.addAlert({ severity: 'info', title: `Alert ${i}`, zoneId: 'a' }).id);
      }
      expect(ids.size).toBe(20);
    });
  });

  // ── acknowledge ────────────────────────────────────────────────────────────
  describe('acknowledge', () => {
    it('marks alert as acknowledged', () => {
      const alert = svc.addAlert({ severity: 'warning', title: 'Warn', zoneId: 'a' });
      expect(svc.acknowledge(alert.id)).toBe(true);
      expect(svc.getActiveAlerts().find((a) => a.id === alert.id)).toBeUndefined();
    });

    it('returns false for an unknown id', () => {
      expect(svc.acknowledge('nonexistent-id')).toBe(false);
    });

    it('emits alert-acknowledged event', () => {
      const handler = jest.fn();
      svc.addEventListener('alert-acknowledged', handler);
      const alert = svc.addAlert({ severity: 'info', title: 'Info', zoneId: 'a' });
      svc.acknowledge(alert.id);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].detail.id).toBe(alert.id);
    });

    it('cancels the auto-dismiss timer on manual acknowledgement', () => {
      const s = new NotificationService({ autoDismissMs: 5000 });
      const handler = jest.fn();
      s.addEventListener('alert-acknowledged', handler);
      const alert = s.addAlert({ severity: 'info', title: 'T', zoneId: 'a' });
      s.acknowledge(alert.id);
      jest.advanceTimersByTime(5000);
      // Should only have been acknowledged once (manually), not twice
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── getActiveAlerts ────────────────────────────────────────────────────────
  describe('getActiveAlerts', () => {
    it('returns empty array when no alerts exist', () => {
      expect(svc.getActiveAlerts()).toEqual([]);
    });

    it('returns only unacknowledged alerts', () => {
      const a1 = svc.addAlert({ severity: 'info', title: 'A', zoneId: 'a' });
      svc.addAlert({ severity: 'warning', title: 'B', zoneId: 'b' });
      svc.acknowledge(a1.id);
      expect(svc.getActiveAlerts().length).toBe(1);
    });

    it('sorts critical before warning before info', () => {
      svc.addAlert({ severity: 'info', title: 'Info', zoneId: 'a' });
      svc.addAlert({ severity: 'critical', title: 'Critical', zoneId: 'b' });
      svc.addAlert({ severity: 'warning', title: 'Warning', zoneId: 'c' });
      const active = svc.getActiveAlerts();
      expect(active[0].severity).toBe('critical');
      expect(active[1].severity).toBe('warning');
      expect(active[2].severity).toBe('info');
    });
  });

  // ── clearAll ───────────────────────────────────────────────────────────────
  describe('clearAll', () => {
    it('removes all alerts from the queue', () => {
      svc.addAlert({ severity: 'info', title: 'A', zoneId: 'a' });
      svc.addAlert({ severity: 'warning', title: 'B', zoneId: 'b' });
      svc.clearAll();
      expect(svc.getActiveAlerts()).toEqual([]);
    });

    it('emits alerts-cleared event', () => {
      const handler = jest.fn();
      svc.addEventListener('alerts-cleared', handler);
      svc.clearAll();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('cancels pending auto-dismiss timers', () => {
      const s = new NotificationService({ autoDismissMs: 5000 });
      const handler = jest.fn();
      s.addEventListener('alert-acknowledged', handler);
      s.addAlert({ severity: 'info', title: 'T', zoneId: 'a' });
      s.clearAll();
      jest.advanceTimersByTime(5000);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
