/**
 * @module venue-map
 * @description Google Maps JavaScript API integration for ArenaIQ.
 *
 * Renders the outdoor arrival routing, parking zones, and transit stops
 * using the Maps JavaScript API.  Overlays real-time crowd density colours
 * on venue zone polygons sourced from a `CrowdMonitor` instance.
 *
 * The Maps SDK is loaded on-demand so the module has zero cost on pages
 * that do not mount a map (e.g., when no API key is configured).
 *
 * Google Services used:
 *   - Maps JavaScript API   — venue map rendering
 *   - Directions Service    — walking routes from user location to gates
 *   - Maps Indoor            — in-venue level overlays (configured via mapId)
 */

/** Maps a DensityLevel to a fill colour for zone polygons. */
const DENSITY_COLORS = Object.freeze({
  normal: '#2d7a3e',
  elevated: '#f0c808',
  high: '#cf3f37',
  critical: '#8b0000',
});

export class VenueMap {
  /**
   * @param {object}      options
   * @param {HTMLElement} options.container   - DOM element that will host the map
   * @param {string}      options.apiKey      - Google Maps JavaScript API key
   * @param {{lat: number, lng: number}} options.center - Venue centre coordinate
   * @param {object}      [options.crowdMonitor] - CrowdMonitor instance for overlays
   * @throws {TypeError} if container is not an HTMLElement
   * @throws {Error}     if apiKey is empty
   */
  constructor({ container, apiKey, center, crowdMonitor = null }) {
    if (!(container instanceof HTMLElement)) {
      throw new TypeError('VenueMap: container must be an HTMLElement');
    }
    if (!apiKey) {
      throw new Error('VenueMap: a Google Maps API key is required');
    }
    this._container = container;
    this._apiKey = apiKey;
    this._center = center;
    this._crowdMonitor = crowdMonitor;
    this._map = null;
    /** @type {Map<string, google.maps.Polygon>} */
    this._polygons = new Map();
    /** @type {Map<string, google.maps.Marker>} */
    this._markers = new Map();
  }

  /**
   * Loads the Google Maps SDK, initialises the map, and renders zone polygons.
   * @param {Array<{id: string, coordinates: Array<{lat:number,lng:number}>}>} [zones=[]]
   * @returns {Promise<void>}
   */
  async init(zones = []) {
    await this._loadGoogleMapsSDK();

    this._map = new window.google.maps.Map(this._container, {
      center: this._center,
      zoom: 16,
      mapTypeId: 'satellite',
      tilt: 0,
      mapId: 'arenaiq-venue',
      gestureHandling: 'cooperative',
      streetViewControl: false,
      fullscreenControl: true,
    });

    zones.forEach((zone) => this._addZonePolygon(zone));

    if (this._crowdMonitor) {
      this._crowdMonitor.addEventListener('zone-update', (e) => {
        this._updateZoneColor(e.detail.zoneId, e.detail.level);
      });
    }
  }

  /**
   * Shows a walking route from `origin` to a named venue gate using the
   * Google Maps Directions Service.
   *
   * @param {{lat: number, lng: number}} origin
   * @param {string} gateId - Gate identifier matching a registered marker
   * @returns {Promise<void>}
   * @throws {Error} if gateId is unknown
   */
  async routeToGate(origin, gateId) {
    const gate = this._markers.get(gateId);
    if (!gate) throw new Error(`VenueMap: unknown gate "${gateId}"`);

    const directionsService = new window.google.maps.DirectionsService();
    const directionsRenderer = new window.google.maps.DirectionsRenderer({ map: this._map });

    const result = await directionsService.route({
      origin,
      destination: gate.getPosition(),
      travelMode: window.google.maps.TravelMode.WALKING,
    });

    directionsRenderer.setDirections(result);
  }

  /**
   * Adds a gate marker to the map.
   * @param {string} gateId
   * @param {{lat: number, lng: number}} position
   * @param {string} label - Short visible label
   */
  addGateMarker(gateId, position, label) {
    const marker = new window.google.maps.Marker({
      position,
      map: this._map,
      label,
      title: gateId,
    });
    this._markers.set(gateId, marker);
  }

  /**
   * Updates a zone polygon fill colour to reflect current density.
   * @param {string} zoneId
   * @param {import('./crowd-monitor.js').DensityLevel} level
   * @private
   */
  _updateZoneColor(zoneId, level) {
    const polygon = this._polygons.get(zoneId);
    if (!polygon) return;
    polygon.setOptions({
      fillColor: DENSITY_COLORS[level] ?? DENSITY_COLORS.normal,
      fillOpacity: 0.45,
    });
  }

  /**
   * @param {{id: string, coordinates: Array<{lat:number,lng:number}>}} zone
   * @private
   */
  _addZonePolygon(zone) {
    const polygon = new window.google.maps.Polygon({
      paths: zone.coordinates,
      strokeColor: '#ffffff',
      strokeOpacity: 0.6,
      strokeWeight: 1.5,
      fillColor: DENSITY_COLORS.normal,
      fillOpacity: 0.3,
      map: this._map,
    });
    this._polygons.set(zone.id, polygon);
  }

  /**
   * Dynamically appends the Google Maps JS SDK `<script>` to `<head>`.
   * Resolves once the SDK global (`window.google.maps`) is ready.
   * @returns {Promise<void>}
   * @private
   */
  _loadGoogleMapsSDK() {
    if (window.google && window.google.maps) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const callbackName = '__arenaiq_maps_ready__';
      window[callbackName] = () => {
        delete window[callbackName];
        resolve();
      };

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(this._apiKey)}&callback=${callbackName}&loading=async`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Failed to load Google Maps SDK'));
      document.head.appendChild(script);
    });
  }
}
