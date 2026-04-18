import {
  getLiveRegion,
  announce,
  trapFocus,
  initSkipLink,
  applyContrastPreferences,
} from '../js/accessibility.js';

// ── getLiveRegion ──────────────────────────────────────────────────────────────
describe('getLiveRegion', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a polite live region with correct ARIA attributes', () => {
    const region = getLiveRegion('polite');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.className).toBe('sr-only');
  });

  it('creates an assertive live region when requested', () => {
    const region = getLiveRegion('assertive');
    expect(region.getAttribute('aria-live')).toBe('assertive');
  });

  it('reuses the same element on repeated calls', () => {
    const first = getLiveRegion('polite');
    const second = getLiveRegion('polite');
    expect(first).toBe(second);
  });

  it('creates separate elements for polite and assertive', () => {
    const polite = getLiveRegion('polite');
    const assertive = getLiveRegion('assertive');
    expect(polite).not.toBe(assertive);
  });

  it('appends the region to document.body', () => {
    const region = getLiveRegion('polite');
    expect(document.body.contains(region)).toBe(true);
  });
});

// ── announce ───────────────────────────────────────────────────────────────────
describe('announce', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runAllTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('sets live region text content after the timeout fires', () => {
    announce('Gate A is now clear');
    jest.runAllTimers();
    const region = document.getElementById('arenaiq-live-polite');
    expect(region.textContent).toBe('Gate A is now clear');
  });

  it('clears the region before setting text (ensures re-announcement)', () => {
    const region = getLiveRegion('polite');
    region.textContent = 'old message';
    announce('new message');
    // Immediately after call, region should be cleared
    expect(region.textContent).toBe('');
    jest.runAllTimers();
    expect(region.textContent).toBe('new message');
  });

  it('truncates messages longer than 300 characters', () => {
    announce('X'.repeat(400));
    jest.runAllTimers();
    const region = document.getElementById('arenaiq-live-polite');
    expect(region.textContent.length).toBeLessThanOrEqual(300);
  });

  it('uses assertive politeness when specified', () => {
    announce('Emergency at Gate B', 'assertive');
    jest.runAllTimers();
    const region = document.getElementById('arenaiq-live-assertive');
    expect(region.textContent).toBe('Emergency at Gate B');
  });

  it('coerces non-string message to string', () => {
    announce(42);
    jest.runAllTimers();
    const region = document.getElementById('arenaiq-live-polite');
    expect(region.textContent).toBe('42');
  });
});

// ── trapFocus ─────────────────────────────────────────────────────────────────
describe('trapFocus', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="modal">
        <button id="btn1">First</button>
        <button id="btn2">Second</button>
        <a href="#" id="link1">Link</a>
      </div>
    `;
    container = document.getElementById('modal');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns a cleanup function', () => {
    const cleanup = trapFocus(container);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('moves focus to the first focusable element', () => {
    trapFocus(container);
    expect(document.activeElement.id).toBe('btn1');
  });

  it('cleanup removes the keydown listener (no further Tab trapping)', () => {
    const cleanup = trapFocus(container);
    cleanup();
    // After cleanup, pressing Tab on the last item should NOT wrap to first
    const link = document.getElementById('link1');
    link.focus();
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const preventDefaultSpy = jest.spyOn(tabEvent, 'preventDefault');
    document.dispatchEvent(tabEvent);
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});

// ── initSkipLink ───────────────────────────────────────────────────────────────
describe('initSkipLink', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <a data-skip-link href="#">Skip</a>
      <main id="main-content"><p>Content</p></main>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sets the skip link href to the target id', () => {
    initSkipLink('main-content');
    expect(document.querySelector('[data-skip-link]').getAttribute('href')).toBe('#main-content');
  });

  it('does nothing when no [data-skip-link] element exists', () => {
    document.body.innerHTML = '<main id="main-content">Content</main>';
    expect(() => initSkipLink('main-content')).not.toThrow();
  });

  it('focuses the main element on click and prevents default navigation', () => {
    initSkipLink('main-content');
    const link = document.querySelector('[data-skip-link]');
    const main = document.getElementById('main-content');

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = jest.spyOn(clickEvent, 'preventDefault');
    link.dispatchEvent(clickEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(main);
  });
});

// ── applyContrastPreferences ──────────────────────────────────────────────────
describe('applyContrastPreferences', () => {
  let originalMatchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    document.documentElement.classList.remove('high-contrast', 'reduce-motion');
  });

  it('adds high-contrast class when OS prefers more contrast', () => {
    window.matchMedia = jest.fn((query) => ({
      matches: query === '(prefers-contrast: more)',
    }));
    applyContrastPreferences();
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
  });

  it('adds reduce-motion class when OS prefers reduced motion', () => {
    window.matchMedia = jest.fn((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    }));
    applyContrastPreferences();
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);
  });

  it('does not add classes when no OS preferences are set', () => {
    window.matchMedia = jest.fn(() => ({ matches: false }));
    applyContrastPreferences();
    expect(document.documentElement.classList.contains('high-contrast')).toBe(false);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(false);
  });
});
