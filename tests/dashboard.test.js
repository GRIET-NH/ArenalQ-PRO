import { escapeHtml, Dashboard } from '../js/dashboard.js';

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('leaves a plain string unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than characters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater-than characters', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('escapes all special characters together', () => {
    expect(escapeHtml('<a href="test" x=\'y\'>foo & bar</a>')).toBe(
      '&lt;a href=&quot;test&quot; x=&#39;y&#39;&gt;foo &amp; bar&lt;/a&gt;',
    );
  });

  it('coerces non-string input to a string', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('null');
    expect(escapeHtml(undefined)).toBe('undefined');
    expect(escapeHtml(true)).toBe('true');
  });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

function makeContainer() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="zone-grid" role="list"></div>
    <ul class="alert-feed" role="list"></ul>
    <p class="alert-feed-empty"></p>
  `;
  document.body.appendChild(el);
  return el;
}

function makeMockCrowdMonitor() {
  return new EventTarget();
}

function makeMockNotifications() {
  const n = new EventTarget();
  n.addAlert = jest.fn();
  n.acknowledge = jest.fn();
  n.getActiveAlerts = jest.fn().mockReturnValue([]);
  return n;
}

describe('Dashboard', () => {
  let container;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('throws TypeError when container is not an HTMLElement', () => {
    const cm = makeMockCrowdMonitor();
    const n = makeMockNotifications();
    expect(() => new Dashboard({ container: null, crowdMonitor: cm, notifications: n })).toThrow(TypeError);
    expect(() => new Dashboard({ container: '#id', crowdMonitor: cm, notifications: n })).toThrow(TypeError);
  });

  it('accepts valid container without throwing', () => {
    const cm = makeMockCrowdMonitor();
    const n = makeMockNotifications();
    expect(() => new Dashboard({ container, crowdMonitor: cm, notifications: n })).not.toThrow();
  });

  it('renders a zone card when a zone-update event fires', () => {
    const cm = makeMockCrowdMonitor();
    const n = makeMockNotifications();
    const db = new Dashboard({ container, crowdMonitor: cm, notifications: n });
    db.mount();

    cm.dispatchEvent(new CustomEvent('zone-update', {
      detail: {
        zoneId: 'gate-north',
        zoneName: 'North Gate',
        density: 0.4,
        level: 'normal',
        estimatedOccupancy: 800,
        capacity: 2000,
        timestamp: Date.now(),
      },
    }));

    const card = container.querySelector('#zone-gate-north');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('North Gate');
  });

  it('updates an existing zone card (no duplicate on second event)', () => {
    const cm = makeMockCrowdMonitor();
    const n = makeMockNotifications();
    const db = new Dashboard({ container, crowdMonitor: cm, notifications: n });
    db.mount();

    const event = {
      zoneId: 'concourse-a',
      zoneName: 'Concourse A',
      density: 0.3,
      level: 'normal',
      estimatedOccupancy: 900,
      capacity: 3000,
      timestamp: Date.now(),
    };

    cm.dispatchEvent(new CustomEvent('zone-update', { detail: event }));
    cm.dispatchEvent(new CustomEvent('zone-update', { detail: { ...event, density: 0.5 } }));

    const cards = container.querySelectorAll('[id^="zone-concourse-a"]');
    expect(cards.length).toBe(1);
  });

  it('applies risk-critical class for a critical zone', () => {
    const cm = makeMockCrowdMonitor();
    const n = makeMockNotifications();
    const db = new Dashboard({ container, crowdMonitor: cm, notifications: n });
    db.mount();

    cm.dispatchEvent(new CustomEvent('zone-update', {
      detail: {
        zoneId: 'section-lower',
        zoneName: 'Lower Bowl',
        density: 0.95,
        level: 'critical',
        estimatedOccupancy: 7600,
        capacity: 8000,
        timestamp: Date.now(),
      },
    }));

    const card = container.querySelector('#zone-section-lower');
    expect(card.classList.contains('risk-critical')).toBe(true);
  });

  it('queues an alert on density-alert event', () => {
    const cm = makeMockCrowdMonitor();
    const n = makeMockNotifications();
    const db = new Dashboard({ container, crowdMonitor: cm, notifications: n });
    db.mount();

    cm.dispatchEvent(new CustomEvent('density-alert', {
      detail: {
        zoneId: 'restroom-a',
        zoneName: 'Restroom Block A',
        density: 0.92,
        level: 'critical',
        estimatedOccupancy: 74,
        capacity: 80,
        timestamp: Date.now(),
      },
    }));

    expect(n.addAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical' }),
    );
  });

  it('renders an alert item when alert-added event fires', () => {
    const cm = makeMockCrowdMonitor();
    const n = makeMockNotifications();
    const db = new Dashboard({ container, crowdMonitor: cm, notifications: n });
    db.mount();

    n.dispatchEvent(new CustomEvent('alert-added', {
      detail: {
        id: 'alert-test-1',
        severity: 'warning',
        title: 'Test alert',
        body: 'Something is elevated',
        zoneId: 'concourse-a',
        timestamp: Date.now(),
        acknowledged: false,
      },
    }));

    const feed = container.querySelector('.alert-feed');
    expect(feed.querySelectorAll('.alert-item').length).toBeGreaterThan(0);
    expect(feed.textContent).toContain('Test alert');
  });

  it('removes an alert item on acknowledge button click', () => {
    const cm = makeMockCrowdMonitor();
    const n = makeMockNotifications();
    const db = new Dashboard({ container, crowdMonitor: cm, notifications: n });
    db.mount();

    n.dispatchEvent(new CustomEvent('alert-added', {
      detail: {
        id: 'alert-test-2',
        severity: 'info',
        title: 'Info alert',
        body: 'Details here',
        zoneId: 'parking-p1',
        timestamp: Date.now(),
        acknowledged: false,
      },
    }));

    const ackBtn = container.querySelector('.alert-item__ack[data-alert-id="alert-test-2"]');
    expect(ackBtn).not.toBeNull();

    ackBtn.click();
    expect(n.acknowledge).toHaveBeenCalledWith('alert-test-2');
    expect(container.querySelector('[data-alert-id="alert-test-2"]')).toBeNull();
  });

  it('caps rendered alert items at 20', () => {
    const cm = makeMockCrowdMonitor();
    const n = makeMockNotifications();
    const db = new Dashboard({ container, crowdMonitor: cm, notifications: n });
    db.mount();

    for (let i = 0; i < 25; i++) {
      n.dispatchEvent(new CustomEvent('alert-added', {
        detail: {
          id: `alert-cap-${i}`,
          severity: 'info',
          title: `Alert ${i}`,
          body: '',
          zoneId: 'venue',
          timestamp: Date.now() + i,
          acknowledged: false,
        },
      }));
    }

    const items = container.querySelectorAll('.alert-item');
    expect(items.length).toBeLessThanOrEqual(20);
  });
});
