import { PreviewEventStream } from './preview-events.js';
import { DartTypedList } from './typed-data.js';
export const notificationCalls = new Set(
  [
    'setup',
    'getInitialTapPayload',
    'requestPermission',
    'show',
    'showChat',
    'cancel',
    'cancelAll',
  ].map((name) => `DartNativeNotifications.${name}`),
);
const text = (value, label, max, empty = true) => {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.length))
    throw Error(`${label} must be ${empty ? '' : 'nonempty '}text up to ${max} characters.`);
  return value;
};
let nextSession = 0;
export class PreviewNotifications {
  constructor(runtime) {
    this.runtime = runtime;
    this.environment = runtime.browserEnvironment;
    this.scope = `native-lab-${++nextSession}-${this.environment.crypto?.randomUUID?.() ?? Date.now()}`;
    this.ready = false;
    this.disposed = false;
    this.onTap = new PreviewEventStream(runtime);
    this.callback = null;
    this.entries = new Map();
    this.pending = new Set();
  }
  check() {
    if (this.disposed) throw Error('The notification preview was disposed.');
    if (!this.ready) throw Error('Call DartNativeNotifications.setup before using notifications.');
  }
  available() {
    const API = this.environment.Notification;
    if (
      typeof API !== 'function' ||
      typeof API.requestPermission !== 'function' ||
      this.environment.isSecureContext === false
    )
      throw Error('System notifications need a secure browser with notification support.');
    return API;
  }
  async permission(requireSetup = true) {
    if (requireSetup) this.check();
    else if (this.disposed) throw Error('The notification preview was disposed.');
    const API = this.available();
    if (API.permission === 'granted') return true;
    if (API.permission === 'denied') return false;
    let cancel;
    const cancelled = new Promise((resolve) => {
      cancel = () => resolve('default');
    });
    this.pending.add(cancel);
    try {
      const permission = await Promise.race([API.requestPermission(), cancelled]);
      return !this.disposed && permission === 'granted';
    } finally {
      this.pending.delete(cancel);
    }
  }
  report(error) {
    if (this.disposed) return;
    this.runtime.logs.push(error.message);
    this.runtime.actionErrors.push(error.message);
    this.runtime.scheduleChange();
  }
  avatar(value) {
    if (!(value instanceof DartTypedList) || value.valueType !== 'Uint8List')
      throw Error('A notification avatar must be Uint8List bytes.');
    if (!value.length) return null;
    if (value.length > 1024 * 1024) throw Error('Notification avatars must be at most 1 MB.');
    const bytes = value.bytes(),
      png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v),
      jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) throw Error('Notification avatars must be encoded JPEG or PNG images.');
    return this.environment.URL.createObjectURL(
      new this.environment.Blob([bytes], { type: png ? 'image/png' : 'image/jpeg' }),
    );
  }
  show(chat, props) {
    this.check();
    const API = this.available();
    if (API.permission !== 'granted')
      throw Error(
        'Notification permission is not granted. Use Request Permission, or allow notifications in your browser’s site settings.',
      );
    const allowed = chat
      ? ['id', 'senderName', 'body', 'avatar', 'payload', 'delaySeconds']
      : ['id', 'title', 'body', 'payload', 'delaySeconds'];
    if (Object.keys(props).some((key) => !allowed.includes(key)))
      throw Error('Unsupported notification arguments.');
    const id = text(props.id, 'Notification ID', 128, false),
      title = text(chat ? props.senderName : props.title, 'Notification title', 256, false),
      body = text(props.body, 'Notification body', 4096),
      payload = text(props.payload ?? '', 'Notification payload', 8192),
      delay = props.delaySeconds ?? 0;
    if (!Number.isInteger(delay) || delay < 0)
      throw Error('Notification delay must be a nonnegative integer.');
    if (delay)
      throw Error(
        'Scheduled notifications need background delivery. This preview currently supports immediate notifications.',
      );
    if (!this.entries.has(id) && this.entries.size >= 20)
      throw Error(
        'A preview can keep at most 20 notifications. Cancel notifications before sending more.',
      );
    const icon = chat ? this.avatar(props.avatar) : null;
    this.cancel(id);
    let notification;
    try {
      notification = new API(title, {
        body,
        tag: `${this.scope}:${id}`,
        data: { payload },
        ...(icon ? { icon } : {}),
      });
    } catch (error) {
      if (icon) this.environment.URL.revokeObjectURL(icon);
      throw Error(`The browser could not create a notification. ${error.message}`);
    }
    const entry = { notification, icon, release: null };
    const shown = () => {
      if (this.disposed || this.entries.get(id) !== entry) return;
      this.runtime.logs.push(`Notification shown by browser: ${id}`);
      this.runtime.scheduleChange();
    };
    const tap = () => {
      if (this.disposed || this.entries.get(id) !== entry) return;
      this.cancel(id);
      if (this.callback) this.runtime.runAction(this.callback, [payload]);
      this.onTap.emit(payload);
    };
    const closed = () => {
      if (this.entries.get(id) === entry) {
        this.entries.delete(id);
        entry.release();
      }
    };
    const error = () => {
      closed();
      this.report(
        Error(
          'The browser could not display the notification. Check browser and operating-system notification settings.',
        ),
      );
    };
    for (const [name, fn] of [
      ['show', shown],
      ['click', tap],
      ['close', closed],
      ['error', error],
    ])
      notification.addEventListener(name, fn);
    entry.release = () => {
      for (const [name, fn] of [
        ['show', shown],
        ['click', tap],
        ['close', closed],
        ['error', error],
      ])
        notification.removeEventListener(name, fn);
      if (icon) this.environment.URL.revokeObjectURL(icon);
    };
    this.entries.set(id, entry);
    return null;
  }
  cancel(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    entry.release();
    entry.notification.close();
  }
  invoke(name, args, props = {}) {
    if (this.disposed) throw Error('The notification preview was disposed.');
    const method = name.split('.').at(-1);
    if (method === 'setup') {
      if (
        args.length ||
        Object.keys(props).some((k) => k !== 'onTap') ||
        (props.onTap != null && typeof props.onTap !== 'function')
      )
        throw Error('Notifications.setup accepts an optional onTap callback.');
      this.callback = props.onTap ?? null;
      this.ready = true;
      return null;
    }
    this.check();
    if (method === 'show' || method === 'showChat') {
      if (args.length) throw Error('Notification arguments must be named.');
      return this.show(method === 'showChat', props);
    }
    if (Object.keys(props).length || args.length !== (method === 'cancel' ? 1 : 0))
      throw Error('Unsupported notification arguments.');
    if (method === 'requestPermission') return this.runtime.routeFuture(this.permission());
    if (method === 'getInitialTapPayload') return null; // Page-owned notifications cannot launch a closed preview.
    if (method === 'cancel') {
      this.cancel(text(args[0], 'Notification ID', 128, false));
      return null;
    }
    if (method === 'cancelAll') {
      for (const id of [...this.entries.keys()]) this.cancel(id);
      return null;
    }
    throw Error(`Unsupported notification method: ${method}`);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of this.pending) cancel();
    this.pending.clear();
    for (const id of [...this.entries.keys()]) this.cancel(id);
    this.onTap.close();
    this.callback = null;
  }
}
