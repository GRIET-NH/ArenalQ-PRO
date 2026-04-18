/**
 * @module theme
 * @description Dark / light mode toggle for the ArenaIQ platform.
 *
 * Persists the user's preference in `localStorage` so it survives page
 * refreshes.  Applies `data-theme="dark"` on `<html>` — styles.css maps
 * this attribute to a set of dark-mode CSS custom property overrides.
 */

const STORAGE_KEY = 'arenaiq-theme';
const DARK = 'dark';
const LIGHT = 'light';

/**
 * Returns the currently active theme.
 * @returns {'dark' | 'light'}
 */
export function getTheme() {
  const stored = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY);
  if (stored === DARK || stored === LIGHT) return stored;

  // Fall back to OS preference
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? DARK : LIGHT;
}

/**
 * Applies the given theme to the document root and persists it.
 * @param {'dark' | 'light'} theme
 */
export function setTheme(theme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, theme);
  }
  // Update toggle button aria-pressed + label
  const btn = document.querySelector('[data-theme-toggle]');
  if (btn) {
    const isDark = theme === DARK;
    btn.setAttribute('aria-pressed', String(isDark));
    btn.setAttribute('aria-checked', String(isDark));
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

/**
 * Wires the `[data-theme-toggle]` button (if present) and applies the stored
 * theme on page load.  Safe to call with no toggle button in the DOM.
 */
export function initThemeToggle() {
  // Apply immediately to avoid flash of wrong theme
  setTheme(getTheme());

  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === DARK ? LIGHT : DARK);
  });
}
