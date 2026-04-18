import { QueuePredictor } from '../js/queue-predictor.js';

describe('QueuePredictor', () => {
  // ── Constructor validation ──────────────────────────────────────────────────
  describe('constructor', () => {
    it('applies default parameters when none are provided', () => {
      const p = new QueuePredictor();
      expect(p.alpha).toBe(0.3);
      expect(p.beta).toBe(0.1);
      expect(p.horizonMinutes).toBe(10);
      expect(p.maxWaitMinutes).toBe(120);
    });

    it('accepts valid custom parameters', () => {
      const p = new QueuePredictor({ alpha: 0.5, beta: 0.2, horizonMinutes: 5, maxWaitMinutes: 60 });
      expect(p.alpha).toBe(0.5);
      expect(p.beta).toBe(0.2);
      expect(p.horizonMinutes).toBe(5);
      expect(p.maxWaitMinutes).toBe(60);
    });

    it.each([
      [{ alpha: 1.5 }, 'alpha above 1'],
      [{ alpha: -0.1 }, 'alpha below 0'],
      [{ beta: 2 }, 'beta above 1'],
      [{ beta: -0.5 }, 'beta below 0'],
      [{ horizonMinutes: 0 }, 'horizonMinutes = 0'],
      [{ horizonMinutes: 200 }, 'horizonMinutes > 120'],
      [{ maxWaitMinutes: 0 }, 'maxWaitMinutes = 0'],
    ])('throws RangeError for %s', (opts) => {
      expect(() => new QueuePredictor(opts)).toThrow(RangeError);
    });

    it('throws RangeError for non-numeric alpha', () => {
      expect(() => new QueuePredictor({ alpha: 'fast' })).toThrow(RangeError);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────
  describe('update', () => {
    let predictor;
    beforeEach(() => {
      predictor = new QueuePredictor();
    });

    it('returns a forecast with all required fields', () => {
      const forecast = predictor.update('gate-a', 5);
      expect(forecast).toMatchObject({
        zoneId: 'gate-a',
        predictedWaitMinutes: expect.any(Number),
        trendMinutesPerUpdate: expect.any(Number),
        riskLevel: expect.stringMatching(/^(low|medium|high|critical)$/),
        confidenceScore: expect.any(Number),
        updatedAt: expect.any(Number),
      });
    });

    it('throws TypeError for empty zoneId', () => {
      expect(() => predictor.update('', 5)).toThrow(TypeError);
    });

    it('throws TypeError for whitespace-only zoneId', () => {
      expect(() => predictor.update('   ', 5)).toThrow(TypeError);
    });

    it('throws RangeError for negative wait time', () => {
      expect(() => predictor.update('zone-a', -1)).toThrow(RangeError);
    });

    it('throws RangeError for wait time above maxWaitMinutes', () => {
      expect(() => predictor.update('zone-a', 150)).toThrow(RangeError);
    });

    it('initialises level to the first observed value', () => {
      predictor.update('zone-a', 8);
      const state = predictor.getState('zone-a');
      expect(state.level).toBe(8);
      expect(state.trend).toBe(0);
      expect(state.observations).toBe(1);
    });

    it('increments observation count on each call', () => {
      for (let i = 0; i < 5; i++) predictor.update('zone-a', i);
      expect(predictor.getState('zone-a').observations).toBe(5);
    });

    it('confidenceScore increases toward 1.0 with more observations', () => {
      const forecasts = [];
      for (let i = 0; i < 12; i++) forecasts.push(predictor.update('zone-a', 5));
      expect(forecasts[0].confidenceScore).toBeLessThan(forecasts[11].confidenceScore);
      expect(forecasts[11].confidenceScore).toBe(1);
    });

    it('detects a rising trend after sustained increases', () => {
      for (let i = 1; i <= 10; i++) predictor.update('rising', i * 2);
      expect(predictor.getState('rising').trend).toBeGreaterThan(0);
    });

    it('predicted wait never exceeds maxWaitMinutes', () => {
      const p = new QueuePredictor({ maxWaitMinutes: 30 });
      for (let i = 0; i < 5; i++) {
        const f = p.update('zone', 30);
        expect(f.predictedWaitMinutes).toBeLessThanOrEqual(30);
      }
    });

    it('predicted wait is never negative', () => {
      for (let i = 10; i >= 0; i--) {
        const f = predictor.update('decreasing', i);
        expect(f.predictedWaitMinutes).toBeGreaterThanOrEqual(0);
      }
    });

    it('tracks multiple zones independently', () => {
      predictor.update('zone-a', 5);
      predictor.update('zone-b', 20);
      expect(predictor.getState('zone-a').level).not.toBe(predictor.getState('zone-b').level);
    });
  });

  // ── _classifyRisk ───────────────────────────────────────────────────────────
  describe('_classifyRisk', () => {
    let predictor;
    beforeEach(() => { predictor = new QueuePredictor(); });

    it.each([
      [0, 'low'],
      [4.9, 'low'],
      [5, 'medium'],
      [9.9, 'medium'],
      [10, 'high'],
      [19.9, 'high'],
      [20, 'critical'],
      [60, 'critical'],
    ])('%p minutes → %s risk', (minutes, expected) => {
      expect(predictor._classifyRisk(minutes)).toBe(expected);
    });
  });

  // ── reset ───────────────────────────────────────────────────────────────────
  describe('reset', () => {
    it('clears all tracked zone states', () => {
      const p = new QueuePredictor();
      p.update('zone-a', 5);
      p.update('zone-b', 10);
      p.reset();
      expect(p.getState('zone-a')).toBeUndefined();
      expect(p.getState('zone-b')).toBeUndefined();
    });
  });

  // ── getState ────────────────────────────────────────────────────────────────
  describe('getState', () => {
    it('returns undefined for unknown zone', () => {
      expect(new QueuePredictor().getState('unknown')).toBeUndefined();
    });
  });
});
