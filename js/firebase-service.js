/**
 * @module firebase-service
 * @description Firebase client-side service for ArenaIQ.
 *
 * Manages lazy initialisation of the Firebase SDK, Firestore real-time
 * subscriptions, Firebase Authentication (custom-token RBAC flow), and
 * Cloud Messaging (FCM) push notification registration.
 *
 * Configuration is never hardcoded — the caller must supply a valid
 * `FirebaseConfig` object sourced from runtime injection (server-rendered
 * `window.__ARENAIQ_CONFIG__` or a secrets manager).
 *
 * Firebase SDK modules are loaded on-demand via dynamic import so that
 * pages without Firebase access (e.g., purely static CDN deploys) incur
 * zero SDK parse cost.
 */

/**
 * @typedef {object} FirebaseConfig
 * @property {string} apiKey
 * @property {string} authDomain
 * @property {string} projectId
 * @property {string} storageBucket
 * @property {string} messagingSenderId
 * @property {string} appId
 */

const FIREBASE_SDK_VERSION = '10.12.0';
const SDK_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

export class FirebaseService {
  /**
   * @param {FirebaseConfig} config
   * @throws {Error} if required config fields are missing
   */
  constructor(config) {
    if (!config || !config.apiKey || !config.projectId) {
      throw new Error(
        'FirebaseService requires a valid config object with at least apiKey and projectId'
      );
    }
    this._config = config;
    this._app = null;
    this._db = null;
    this._auth = null;
    this._firestoreHelpers = null;
    this._authHelpers = null;
    this._initialized = false;
  }

  /**
   * Lazily initialises Firebase app, Firestore, and Auth SDK modules.
   * Safe to call multiple times — subsequent calls are no-ops.
   * @returns {Promise<void>}
   */
  async init() {
    if (this._initialized) return;

    const [
      { initializeApp },
      { getFirestore, collection, onSnapshot },
      { getAuth, signInWithCustomToken, onAuthStateChanged },
    ] = await Promise.all([
      import(`${SDK_BASE}/firebase-app.js`),
      import(`${SDK_BASE}/firebase-firestore.js`),
      import(`${SDK_BASE}/firebase-auth.js`),
    ]);

    this._app = initializeApp(this._config);
    this._db = getFirestore(this._app);
    this._auth = getAuth(this._app);
    this._firestoreHelpers = { collection, onSnapshot };
    this._authHelpers = { signInWithCustomToken, onAuthStateChanged };
    this._initialized = true;
  }

  /**
   * Opens a real-time Firestore collection subscription.
   * Must be called after `init()`.
   *
   * @param {string}   collectionPath - Firestore collection path
   * @param {function} callback       - Receives a QuerySnapshot on each update
   * @returns {function} unsubscribe function
   * @throws {Error} if called before `init()`
   */
  subscribeToCollection(collectionPath, callback) {
    if (!this._initialized) {
      throw new Error('Call FirebaseService.init() before subscribing to collections');
    }
    const { collection, onSnapshot } = this._firestoreHelpers;
    return onSnapshot(collection(this._db, collectionPath), callback);
  }

  /**
   * Signs in an operator using a short-lived custom token issued by the
   * ArenaIQ backend after RBAC role verification.
   *
   * @param {string} customToken - Server-issued Firebase custom token
   * @returns {Promise<object>} Firebase UserCredential
   */
  async signInOperator(customToken) {
    if (!this._initialized) await this.init();
    const { signInWithCustomToken } = this._authHelpers;
    return signInWithCustomToken(this._auth, customToken);
  }

  /**
   * Returns the currently authenticated Firebase user, or `null`.
   * @returns {object | null}
   */
  get currentUser() {
    return this._auth ? this._auth.currentUser : null;
  }

  /**
   * Registers the browser for FCM push notifications.
   * Requests Notification permission if not already granted.
   *
   * @param {string} vapidKey - Web push certificate VAPID public key
   * @returns {Promise<string>} FCM registration token
   * @throws {Error} if notification permission is denied
   */
  async registerForPushNotifications(vapidKey) {
    if (!this._initialized) await this.init();

    const { getMessaging, getToken } = await import(`${SDK_BASE}/firebase-messaging.js`);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied by the user');
    }

    const messaging = getMessaging(this._app);
    return getToken(messaging, { vapidKey });
  }
}
