/**
 * @module accessibility
 * @description Accessibility utilities for the ArenaIQ platform.
 *
 * Provides:
 *   - ARIA live-region management for real-time screen-reader announcements
 *   - Keyboard focus trapping for modal dialogs
 *   - Skip-navigation link wiring
 *   - OS-level contrast / motion preference detection
 *
 * All utilities are pure functions with no side effects beyond DOM mutation,
 * making them straightforward to unit-test with jsdom.
 */

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Creates (or reuses) a visually-hidden ARIA live region appended to
 * `document.body`.  Only one region per politeness level is created.
 *
 * @param {'polite' | 'assertive'} [politeness='polite']
 * @returns {HTMLElement}
 */
export function getLiveRegion(politeness = 'polite') {
  const id = `arenaiq-live-${politeness}`;
  let region = document.getElementById(id);

  if (!region) {
    region = document.createElement('div');
    region.id = id;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    document.body.appendChild(region);
  }

  return region;
}

/**
 * Announces a message to screen readers via an ARIA live region.
 * The region is cleared before the message is set so repeated identical
 * messages are re-announced.
 *
 * @param {string}                    message
 * @param {'polite' | 'assertive'}   [politeness='polite']
 */
export function announce(message, politeness = 'polite') {
  const region = getLiveRegion(politeness);
  const text = String(message).slice(0, 300);

  // Clear first so the same string re-triggers the AT announcement
  region.textContent = '';
  setTimeout(() => {
    region.textContent = text;
  }, 0);
}

/**
 * Traps keyboard Tab focus within `container`.
 * Focus is immediately moved to the first focusable descendant.
 *
 * @param {HTMLElement} container
 * @returns {function} cleanup — call to remove the focus trap
 */
export function trapFocus(container) {
  const getFocusable = () => Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS));

  const handleKeydown = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', handleKeydown);

  const firstFocusable = getFocusable()[0];
  if (firstFocusable) firstFocusable.focus();

  return () => document.removeEventListener('keydown', handleKeydown);
}

/**
 * Wires the skip-navigation link (identified by `[data-skip-link]`) to
 * programmatically focus the main content element.
 *
 * @param {string} [mainId='main-content']
 */
export function initSkipLink(mainId = 'main-content') {
  const link = document.querySelector('[data-skip-link]');
  if (!link) return;

  link.setAttribute('href', `#${mainId}`);

  link.addEventListener('click', (e) => {
    e.preventDefault();
    const main = document.getElementById(mainId);
    if (!main) return;
    main.setAttribute('tabindex', '-1');
    main.focus();
    main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
  });
}

/**
 * Reads OS-level accessibility preferences and applies corresponding
 * CSS classes to `<html>` so stylesheets can react with `@media` overrides.
 */
export function applyContrastPreferences() {
  const prefersHighContrast = window.matchMedia('(prefers-contrast: more)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.classList.toggle('high-contrast', prefersHighContrast);
  document.documentElement.classList.toggle('reduce-motion', prefersReducedMotion);
}
