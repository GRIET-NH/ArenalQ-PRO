import { getTheme, setTheme, initThemeToggle } from '../js/theme.js';

describe('theme', () => {
  beforeEach(() => {
    // Reset DOM state
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
    localStorage.clear();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
    localStorage.clear();
  });

  // ── getTheme ────────────────────────────────────────────────────────────────

  it('returns "light" by default when no stored preference and no dark OS pref', () => {
    // jsdom does not match prefers-color-scheme, so no stored pref → light
    expect(getTheme()).toBe('light');
  });

  it('returns stored "dark" preference from localStorage', () => {
    localStorage.setItem('arenaiq-theme', 'dark');
    expect(getTheme()).toBe('dark');
  });

  it('returns stored "light" preference from localStorage', () => {
    localStorage.setItem('arenaiq-theme', 'light');
    expect(getTheme()).toBe('light');
  });

  it('ignores unknown values in localStorage and falls back to light', () => {
    localStorage.setItem('arenaiq-theme', 'blue');
    expect(getTheme()).toBe('light');
  });

  // ── setTheme ────────────────────────────────────────────────────────────────

  it('sets data-theme attribute on <html> to "dark"', () => {
    setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sets data-theme attribute on <html> to "light"', () => {
    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('persists the theme to localStorage', () => {
    setTheme('dark');
    expect(localStorage.getItem('arenaiq-theme')).toBe('dark');
    setTheme('light');
    expect(localStorage.getItem('arenaiq-theme')).toBe('light');
  });

  it('updates toggle button aria-pressed when button is present', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-theme-toggle', '');
    document.body.appendChild(btn);

    setTheme('dark');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.textContent).toBe('☀');

    setTheme('light');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.textContent).toBe('🌙');
  });

  it('does not throw when no toggle button is in the DOM', () => {
    expect(() => setTheme('dark')).not.toThrow();
    expect(() => setTheme('light')).not.toThrow();
  });

  // ── initThemeToggle ─────────────────────────────────────────────────────────

  it('applies the stored theme on init', () => {
    localStorage.setItem('arenaiq-theme', 'dark');
    initThemeToggle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('wires the toggle button to switch themes on click', () => {
    setTheme('light');
    const btn = document.createElement('button');
    btn.setAttribute('data-theme-toggle', '');
    document.body.appendChild(btn);

    initThemeToggle();

    // Currently light — click should switch to dark
    btn.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Click again to go back to light
    btn.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('does not throw when no toggle button is present', () => {
    expect(() => initThemeToggle()).not.toThrow();
  });
});
