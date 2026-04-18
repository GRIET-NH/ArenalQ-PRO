import { SimulatedVenueMap } from '../js/simulated-venue-map.js';

// jsdom provides a basic DOM, but SVG createElementNS support is limited.
// We verify the public contract (constructor guards, init, zone updates)
// without asserting on SVG rendering internals that jsdom does not support.

describe('SimulatedVenueMap', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // ── Constructor guards ───────────────────────────────────────────────────────

  it('throws TypeError when container is not an HTMLElement', () => {
    expect(() => new SimulatedVenueMap({ container: null })).toThrow(TypeError);
    expect(() => new SimulatedVenueMap({ container: '#venue-map' })).toThrow(TypeError);
    expect(() => new SimulatedVenueMap({ container: undefined })).toThrow(TypeError);
  });

  it('accepts a valid HTMLElement without throwing', () => {
    expect(() => new SimulatedVenueMap({ container })).not.toThrow();
  });

  it('works without a crowdMonitor option', () => {
    const map = new SimulatedVenueMap({ container });
    expect(() => map.init()).not.toThrow();
  });

  // ── init ────────────────────────────────────────────────────────────────────

  it('replaces container content with an SVG element on init', () => {
    container.innerHTML = '<div class="venue-map-placeholder"><p>Placeholder</p></div>';
    const map = new SimulatedVenueMap({ container });
    map.init();

    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.venue-map-placeholder')).toBeNull();
  });

  it('rendered SVG has role="img" and an aria-label', () => {
    const map = new SimulatedVenueMap({ container });
    map.init();

    const svg = container.querySelector('svg');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders one SVG group per zone', () => {
    const map = new SimulatedVenueMap({ container });
    map.init();

    // 8 zones defined in ZONE_LAYOUT
    const groups = container.querySelectorAll('g[data-zone-id]');
    expect(groups.length).toBe(8);
  });

  // ── zone-update events ───────────────────────────────────────────────────────

  it('subscribes to zone-update events from crowdMonitor', () => {
    const crowdMonitor = new EventTarget();
    const map = new SimulatedVenueMap({ container, crowdMonitor });
    map.init();

    // Dispatching a zone-update event should not throw
    expect(() => {
      crowdMonitor.dispatchEvent(
        new CustomEvent('zone-update', {
          detail: {
            zoneId: 'gate-north',
            zoneName: 'North Gate',
            density: 0.42,
            level: 'normal',
            estimatedOccupancy: 840,
            capacity: 2000,
            timestamp: Date.now(),
          },
        }),
      );
    }).not.toThrow();
  });

  it('updates the density percentage text when a zone-update is received', () => {
    const crowdMonitor = new EventTarget();
    const map = new SimulatedVenueMap({ container, crowdMonitor });
    map.init();

    crowdMonitor.dispatchEvent(
      new CustomEvent('zone-update', {
        detail: {
          zoneId: 'section-lower',
          zoneName: 'Lower Bowl',
          density: 0.75,
          level: 'elevated',
          estimatedOccupancy: 6000,
          capacity: 8000,
          timestamp: Date.now(),
        },
      }),
    );

    const group = container.querySelector('[data-zone-id="section-lower"]');
    expect(group).not.toBeNull();

    // The group's aria-label should include the updated density
    const ariaLabel = group.getAttribute('aria-label');
    expect(ariaLabel).toContain('75%');
    expect(ariaLabel).toContain('elevated');
  });

  it('ignores zone-update events for unknown zone IDs', () => {
    const crowdMonitor = new EventTarget();
    const map = new SimulatedVenueMap({ container, crowdMonitor });
    map.init();

    expect(() => {
      crowdMonitor.dispatchEvent(
        new CustomEvent('zone-update', {
          detail: {
            zoneId: 'unknown-zone-xyz',
            zoneName: 'Unknown',
            density: 0.5,
            level: 'elevated',
            estimatedOccupancy: 100,
            capacity: 200,
            timestamp: Date.now(),
          },
        }),
      );
    }).not.toThrow();
  });

  it('handles all four density levels without throwing', () => {
    const crowdMonitor = new EventTarget();
    const map = new SimulatedVenueMap({ container, crowdMonitor });
    map.init();

    const levels = ['normal', 'elevated', 'high', 'critical'];
    levels.forEach((level, i) => {
      expect(() => {
        crowdMonitor.dispatchEvent(
          new CustomEvent('zone-update', {
            detail: {
              zoneId: 'concourse-a',
              zoneName: 'Concourse A',
              density: 0.2 + i * 0.2,
              level,
              estimatedOccupancy: 500 + i * 500,
              capacity: 3000,
              timestamp: Date.now(),
            },
          }),
        );
      }).not.toThrow();
    });
  });
});
