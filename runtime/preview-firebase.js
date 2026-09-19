import { PreviewEventStream } from './preview-events.js';
import { validateFirebasePreviewConfig } from './firebase-preview-config.js';
export const firebaseCalls = new Set([
  'Firebase.initializeApp',
  'FirebaseMessaging.setup',
  'FirebaseMessaging.getToken',
  'FirebaseMessaging.requestPermission',
]);
const missing =
  'Firebase push is not configured. Open Preview services and add your Firebase web-app settings and public VAPID key.';
export class FirebaseMessage {
  constructor(payload) {
    this.valueType = 'RemoteMessage';
    this.values = {
      messageId: String(payload.messageId ?? ''),
      from: String(payload.from ?? ''),
      collapseKey: String(payload.collapseKey ?? ''),
      notificationTitle: payload.notification?.title ?? null,
      notificationBody: payload.notification?.body ?? null,
      data: Object.assign(
        Object.create(null),
        Object.fromEntries(
          Object.entries(payload.data ?? {}).filter(([k, v]) => typeof v === 'string'),
        ),
      ),
    };
  }
  read(name) {
    if (Object.hasOwn(this.values, name)) return this.values[name];
    throw Error(`Unsupported RemoteMessage property: ${name}`);
  }
}
export class PreviewFirebase {
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.options = options;
    this.disposed = false;
    this.ready = false;
    this.connection = null;
    this.initializing = null;
    this.token = null;
    this.pending = new Set();
    this.onMessage = new PreviewEventStream(runtime);
    this.onTokenRefresh = new PreviewEventStream(runtime);
  }
  read(name) {
    if (name === 'onMessage' || name === 'onTokenRefresh') return this[name];
    throw Error(`FirebaseMessaging.${name} has no browser adapter yet.`);
  }
  async initialize() {
    if (this.disposed) throw Error('The Firebase preview was disposed.');
    if (this.connection) return null;
    if (this.initializing) return this.initializing;
    if (!this.options.config) throw Error(missing);
    const config = validateFirebasePreviewConfig(this.options.config);
    this.initializing = (async () => {
      const connect = this.options.connect;
      if (typeof connect !== 'function')
        throw Error(
          'This host cannot connect to Firebase. Use the browser playground with Preview services configured.',
        );
      const connection = await connect(config, (payload) => {
        if (!this.disposed && this.ready) this.onMessage.emit(new FirebaseMessage(payload));
      });
      if (this.disposed) {
        connection.release();
        throw Error('The Firebase preview was disposed.');
      }
      this.connection = connection;
      return null;
    })().finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }
  future(promise) {
    promise.catch(() => {});
    return this.runtime.routeFuture(promise);
  }
  async getToken() {
    if (this.disposed) throw Error('The Firebase preview was disposed.');
    if (!this.connection || !this.ready)
      throw Error(
        this.options.config
          ? 'Call Firebase.initializeApp and FirebaseMessaging.setup before requesting a token.'
          : missing,
      );
    let timer, cancel;
    const interruption = new Promise((resolve, reject) => {
      cancel = () => resolve(null);
      timer = setTimeout(
        () =>
          reject(
            Error(
              'Firebase web push token request timed out. Check network access and your Firebase web-app configuration.',
            ),
          ),
        30000,
      );
    });
    this.pending.add(cancel);
    try {
      const token = await Promise.race([this.connection.getToken(), interruption]);
      if (this.disposed) return null;
      if (typeof token !== 'string' || !token)
        throw Error('Firebase did not return a web push token.');
      if (this.token !== token) {
        this.token = token;
        this.onTokenRefresh.emit(token);
      }
      return token;
    } finally {
      clearTimeout(timer);
      this.pending.delete(cancel);
    }
  }
  invoke(name, args, props = {}) {
    if (this.disposed) throw Error('The Firebase preview was disposed.');
    if (args.length || Object.keys(props).length) throw Error(`${name} accepts no arguments.`);
    if (name === 'Firebase.initializeApp') return this.future(this.initialize());
    if (name === 'FirebaseMessaging.setup') {
      if (!this.connection)
        throw Error(
          this.options.config
            ? 'Await Firebase.initializeApp before FirebaseMessaging.setup.'
            : missing,
        );
      this.ready = true;
      return null;
    }
    if (name === 'FirebaseMessaging.getToken') return this.future(this.getToken());
    if (name === 'FirebaseMessaging.requestPermission')
      return this.future(this.runtime.notifications.permission(false));
    throw Error(`${name} has no browser adapter yet.`);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of this.pending) cancel();
    this.pending.clear();
    this.connection?.release();
    this.connection = null;
    this.onMessage.close();
    this.onTokenRefresh.close();
  }
}
