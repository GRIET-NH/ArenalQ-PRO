/**
 * @module simulated-venue-map
 * @description Venue map rendered in simulation / no-key mode.
 *
 * Renders two panels inside the container:
 *  1. A real Google Maps iframe (Embed API — no JS SDK key required) centred
 *     on the venue coordinates, giving ops staff and fans a genuine location
 *     reference without any billable API call.
 *  2. A top-down SVG schematic of the eight venue zones coloured in real time
 *     to reflect the crowd density level emitted by a `CrowdMonitor` instance.
 *
 * Mirrors the public interface of `VenueMap` so `main.js` can swap between the
 * two implementations without conditional logic inside callers.
 */

/** Maps a DensityLevel to a stroke/border colour for zone shapes. */
const DENSITY_STROKE = Object.freeze({
  normal: '#2d7a3e',
  elevated: '#c89800',
  high: '#cf3f37',
  critical: '#8b0000',
});

/** Maps a DensityLevel to a background fill colour for zone shapes. */
const DENSITY_FILL = Object.freeze({
  normal: '#e8f5e9',
  elevated: '#fff8dc',
  high: '#fdecea',
  critical: '#fce4e4',
});

/**
 * Top-down schematic layout — each entry maps to one of the eight zones that
 * `CrowdMonitor` simulates.  Coordinates are in SVG user units (viewBox 480×360).
 *
 * Zone footprint (x,y → x+w, y+h):
 *   Parking background  :   0,   0 → 480, 360   (drawn first, fills corners)
 *   North Gate          : 195,  10 →  285,  55
 *   Concourse A         :  55,  60 →  425, 130
 *   Concessions         :  55, 130 →  130, 230
 *   Lower Bowl          : 130, 130 →  330, 230
 *   Restrooms           : 330, 130 →  425, 230
 *   Concourse B         :  55, 230 →  425, 300
 *   South Gate          : 195, 305 →  285, 350
 *
 * @type {ReadonlyArray<{id:string,x:number,y:number,w:number,h:number,rx:number,label:string,labelFs:number,pctFs:number,isBg?:boolean}>}
 */
const ZONE_LAYOUT = Object.freeze([
  { id: 'parking-p1',       x: 0,   y: 0,   w: 480, h: 360, rx: 0, label: 'Parking P1',  labelFs: 9,  pctFs: 0,  isBg: true  },
  { id: 'gate-north',       x: 195, y: 10,  w: 90,  h: 45,  rx: 6, label: 'North Gate',  labelFs: 8,  pctFs: 9              },
  { id: 'concourse-a',      x: 55,  y: 60,  w: 370, h: 70,  rx: 4, label: 'Concourse A', labelFs: 11, pctFs: 10             },
  { id: 'concessions-main', x: 55,  y: 130, w: 75,  h: 100, rx: 4, label: 'Concessions', labelFs: 9,  pctFs: 10             },
  { id: 'section-lower',    x: 130, y: 130, w: 200, h: 100, rx: 8, label: 'Lower Bowl',  labelFs: 13, pctFs: 12             },
  { id: 'restroom-a',       x: 330, y: 130, w: 95,  h: 100, rx: 4, label: 'Restrooms',   labelFs: 9,  pctFs: 10             },
  { id: 'concourse-b',      x: 55,  y: 230, w: 370, h: 70,  rx: 4, label: 'Concourse B', labelFs: 11, pctFs: 10             },
  { id: 'gate-south',       x: 195, y: 305, w: 90,  h: 45,  rx: 6, label: 'South Gate',  labelFs: 8,  pctFs: 9              },
]);

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Neutral fill used before the first `CrowdMonitor` update arrives. */
const INITIAL_FILL = '#f0f2f0';

export class SimulatedVenueMap {
  /**
   * @param {object}      options
   * @param {HTMLElement} options.container    - DOM element that will host the map
   * @param {object}      [options.crowdMonitor] - CrowdMonitor instance for overlays
   * @param {{lat: number, lng: number}} [options.center] - Venue centre coordinate
   * @throws {TypeError} if container is not an HTMLElement
   */
  constructor({ container, crowdMonitor = null, center = { lat: 40.7484, lng: -73.9967 } }) {
    if (!(container instanceof HTMLElement)) {
      throw new TypeError('SimulatedVenueMap: container must be an HTMLElement');
    }
    this._container = container;
    this._crowdMonitor = crowdMonitor;
    this._center = center;
    /** @type {Map<string, SVGRectElement>} */
    this._rects = new Map();
    /** @type {Map<string, SVGTextElement>} */
    this._pctTexts = new Map();
    /** @type {Map<string, SVGGElement>} */
    this._groups = new Map();
  }

  /**
   * Renders the SVG schematic and subscribes to `CrowdMonitor` zone updates.
   */
  init() {
    this._render();
    if (this._crowdMonitor) {
      this._crowdMonitor.addEventListener('zone-update', (e) => {
        this._updateZone(e.detail);
      });
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  /** @private */
  _render() {
    // ── Outer wrapper ──────────────────────────────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.className = 'simmap-wrapper';

    // ── Google Maps iframe (Embed API — no key required) ───────────────────────
    const { lat, lng } = this._center;
    const mapSrc =
      `https://maps.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&z=16&output=embed`;

    const iframe = document.createElement('iframe');
    iframe.className = 'simmap-iframe';
    iframe.src = mapSrc;
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    iframe.setAttribute('title', 'Venue location on Google Maps');
    iframe.setAttribute('aria-label', 'Google Maps showing venue location');
    wrapper.appendChild(iframe);

    // ── SVG density schematic ──────────────────────────────────────────────────
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 480 360');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Simulated venue crowd-density map');

    for (const zone of ZONE_LAYOUT) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('aria-label', zone.label);
      g.dataset.zoneId = zone.id;

      // Rect ──────────────────────────────────────────────────────────────────
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', zone.x);
      rect.setAttribute('y', zone.y);
      rect.setAttribute('width', zone.w);
      rect.setAttribute('height', zone.h);
      rect.setAttribute('rx', zone.rx);
      rect.setAttribute('fill', INITIAL_FILL);
      rect.setAttribute('stroke', zone.isBg ? 'none' : 'rgba(255,255,255,0.85)');
      rect.setAttribute('stroke-width', zone.isBg ? '0' : '1.5');
      this._rects.set(zone.id, rect);
      g.appendChild(rect);

      // Accessible title tooltip ──────────────────────────────────────────────
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = zone.label;
      g.appendChild(title);

      const cx = zone.x + zone.w / 2;
      const cy = zone.y + zone.h / 2;

      if (zone.isBg) {
        // Parking label sits in the bottom-left corner
        const parkingLabel = this._makeText(8, 353, zone.label, zone.labelFs, '#78909c', 'start');
        g.appendChild(parkingLabel);
      } else {
        // Zone name (slightly above centre) ──────────────────────────────────
        const nameOffset = zone.h <= 45 ? -7 : -10;
        const nameText = this._makeText(cx, cy + nameOffset, zone.label, zone.labelFs, '#37474f', 'middle');
        nameText.setAttribute('font-weight', '600');
        g.appendChild(nameText);

        // Density percentage (slightly below centre) ──────────────────────────
        const pctText = this._makeText(cx, cy + 10, '', zone.pctFs, '#546e7a', 'middle');
        this._pctTexts.set(zone.id, pctText);
        g.appendChild(pctText);
      }

      svg.appendChild(g);
      this._groups.set(zone.id, g);
    }

    // "SIMULATION MODE" badge ─────────────────────────────────────────────────
    const badge = this._makeText(472, 352, 'SIMULATION MODE', 8, '#90a4ae', 'end');
    badge.setAttribute('font-style', 'italic');
    svg.appendChild(badge);

    // SVG container panel with label ──────────────────────────────────────────
    const svgPanel = document.createElement('div');
    svgPanel.className = 'simmap-density-panel';

    const svgLabel = document.createElement('p');
    svgLabel.className = 'simmap-density-label';
    svgLabel.textContent = 'Live Crowd Density Overlay';
    svgPanel.appendChild(svgLabel);
    svgPanel.appendChild(svg);
    wrapper.appendChild(svgPanel);

    this._container.innerHTML = '';
    this._container.appendChild(wrapper);
  }

  /**
   * Updates a zone's fill colour, border, density label, and aria-label.
   * @param {import('./crowd-monitor.js').ZoneDensity} zone
   * @private
   */
  _updateZone(zone) {
    const rect = this._rects.get(zone.zoneId);
    if (rect) {
      const fill = DENSITY_FILL[zone.level] ?? DENSITY_FILL.normal;
      const stroke = DENSITY_STROKE[zone.level] ?? DENSITY_STROKE.normal;
      rect.setAttribute('fill', fill);
      rect.setAttribute('stroke', stroke);
    }

    const pctText = this._pctTexts.get(zone.zoneId);
    if (pctText) {
      pctText.textContent = `${Math.round(zone.density * 100)}%`;
    }

    const g = this._groups.get(zone.zoneId);
    if (g) {
      g.setAttribute(
        'aria-label',
        `${zone.zoneName}: ${zone.level} density at ${Math.round(zone.density * 100)}%`,
      );
    }
  }

  /**
   * Creates an SVG `<text>` element.
   * @param {number} x
   * @param {number} y
   * @param {string} content
   * @param {number} fontSize
   * @param {string} fill
   * @param {string} textAnchor
   * @returns {SVGTextElement}
   * @private
   */
  _makeText(x, y, content, fontSize, fill, textAnchor) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y);
    text.setAttribute('font-size', fontSize);
    text.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    text.setAttribute('fill', fill);
    text.setAttribute('text-anchor', textAnchor);
    text.setAttribute('pointer-events', 'none');
    text.textContent = content;
    return text;
  }
}
