import { dartInvocation } from './dart-environment.js';
import { memoryStorageBackend } from './preview-storage-backend.js';
import { PreviewSqlite } from './preview-sqlite.js';
export const storageCalls = new Set([
  'SecureStorage',
  'Hive.initDartNative',
  'Hive.openBox',
  'Hive.close',
  'Sqlite.open',
  'Sqlite.ensureInitialized',
  'Sqlite.deleteDatabase',
  'Sqlite.getDatabasesPath',
  'getApplicationDocumentsDirectory',
  'getTemporaryDirectory',
  'getApplicationSupportDirectory',
  'getApplicationCacheDirectory',
  'createUnprotectedFolder',
  'Directory',
]);
const named = (fn) =>
  Object.assign((...args) => fn({}, args), { [dartInvocation]: (args, props) => fn(props, args) });
const text = (value, label) => {
  if (typeof value !== 'string' || !value || value.length > 4096)
    throw Error(`${label} must be non-empty text under 4 KB.`);
  return value;
};
const entryKey = (value) => {
  if (typeof value === 'string') return `s:${value}`;
  if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff) return `i:${value}`;
  throw Error('Box keys must be strings or unsigned integers.');
};
function copyValue(value, depth = 0) {
  if (depth > 30) throw Error('Stored value is too deeply nested.');
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (Array.isArray(value)) return value.map((item) => copyValue(item, depth + 1));
  if (value && Object.getPrototypeOf(value) === null)
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copyValue(item, depth + 1)]),
    );
  throw Error('Preview boxes support text, numbers, booleans, lists and maps.');
}
function dartValue(value) {
  if (Array.isArray(value)) return value.map(dartValue);
  if (value && typeof value === 'object')
    return Object.assign(
      Object.create(null),
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, dartValue(item)])),
    );
  return value;
}
export class PreviewStorage {
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.backend = options.backend || memoryStorageBackend();
    this.crypto = options.crypto;
    this.sqliteFactory = options.sqliteFactory;
    this.boxes = new Map();
    this.databases = new Map();
    this.hivePath = null;
    this.disposed = false;
  }
  check() {
    if (this.disposed) throw Error('Preview storage session was disposed.');
  }
  invoke(name, args, props) {
    this.check();
    if (name === 'SecureStorage') {
      if (Object.keys(props).length)
        throw Error('Native secure storage options are unavailable in the browser.');
      return this.secure();
    }
    if (name === 'Hive.initDartNative') {
      this.hivePath =
        this.path(args[0]) + (props.subDir ? '/' + text(props.subDir, 'Hive subdirectory') : '');
      return null;
    }
    if (name === 'Hive.openBox') return this.openBox(args[0], props);
    if (name === 'Hive.close') {
      for (const box of this.boxes.values()) box.closed = true;
      this.boxes.clear();
      return Promise.resolve(null);
    }
    if (name === 'Sqlite.ensureInitialized') return null;
    if (name === 'Sqlite.open') return this.openDatabase(args[0], props);
    if (name === 'Sqlite.deleteDatabase') {
      const path = this.path(args[0]);
      if (this.databases.get(path) && !this.databases.get(path).closed)
        throw Error('Close the database before deleting it.');
      return this.backend.lock(`sqlite:${path}`, () => this.backend.delete(`sqlite:${path}`));
    }
    if (name === 'Sqlite.getDatabasesPath') return Promise.resolve('/preview/documents/database');
    if (name.startsWith('get'))
      return name === 'getTemporaryDirectory'
        ? '/preview/cache'
        : name === 'getApplicationCacheDirectory'
          ? '/preview/cache'
          : name === 'getApplicationSupportDirectory'
            ? '/preview/support'
            : '/preview/documents';
    // Directory paths are names within browser storage, never host paths. No
    // browser equivalent exists for an iOS file-protection class.
    if (name === 'createUnprotectedFolder') {
      this.path(props.parent);
      text(props.name, 'Directory name');
      return Promise.resolve(false);
    }
    if (name === 'Directory') {
      const path = this.path(args[0]),
        root = ['/preview/documents', '/preview/cache', '/preview/support'].includes(path);
      return {
        path,
        exists: async () => root || !!(await this.backend.get(`directory:${path}`)),
        create: named(async ({ recursive = false }) => {
          this.check();
          const parent = path.slice(0, path.lastIndexOf('/'));
          if (
            !recursive &&
            !['/preview', '/preview/documents', '/preview/cache', '/preview/support'].includes(
              parent,
            ) &&
            !(await this.backend.get(`directory:${parent}`))
          )
            throw Error('Parent preview directory does not exist.');
          await this.backend.put(`directory:${path}`, true);
          return { path };
        }),
      };
    }
    throw Error(`Unsupported storage call: ${name}`);
  }
  path(value) {
    text(value, 'Storage path');
    if (
      !value.startsWith('/preview/') ||
      value.split('/').some((part) => part === '..' || part === '.')
    )
      throw Error('Use a preview path from dartnative_path_provider.');
    return value;
  }
  secure() {
    const prefix = 'secure:entry:',
      services = this;
    const perform = (action) => {
      this.check();
      if (!this.crypto?.subtle)
        throw Error('Secure storage requires Web Crypto in a secure browser context.');
      return this.backend.lock('secure', async () => {
        this.check();
        return action();
      });
    };
    const keyFor = (key) => prefix + encodeURIComponent(text(key, 'Secure storage key'));
    const cipherKey = async () => {
      let key = await this.backend.get('secure:key');
      if (!key) {
        key = await this.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
          'decrypt',
        ]);
        this.check();
        await this.backend.put('secure:key', key);
      }
      return key;
    };
    const read = async (key) => {
      const entry = await this.backend.get(keyFor(key));
      if (!entry) return null;
      const bytes = await this.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: entry.iv, additionalData: new TextEncoder().encode(key) },
        await cipherKey(),
        entry.ciphertext,
      );
      return new TextDecoder().decode(bytes);
    };
    return {
      read: named(({ key }) => perform(() => read(key))),
      write: named(({ key, value }) =>
        perform(async () => {
          const id = keyFor(key);
          if (value == null) {
            await this.backend.delete(id);
            return null;
          }
          if (typeof value !== 'string' || value.length > 1000000)
            throw Error('Secure values must be strings under 1 MB.');
          const iv = this.crypto.getRandomValues(new Uint8Array(12)),
            ciphertext = await this.crypto.subtle.encrypt(
              { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(key) },
              await cipherKey(),
              new TextEncoder().encode(value),
            );
          this.check();
          await this.backend.put(id, { iv, ciphertext });
          return null;
        }),
      ),
      delete: named(({ key }) => perform(() => this.backend.delete(keyFor(key)))),
      containsKey: named(({ key }) =>
        perform(async () => (await this.backend.get(keyFor(key))) != null),
      ),
      deleteAll: () =>
        perform(async () => {
          for (const key of await this.backend.keys(prefix)) {
            services.check();
            await services.backend.delete(key);
          }
          return null;
        }),
      readAll: () =>
        perform(async () => {
          const result = Object.create(null);
          for (const stored of await this.backend.keys(prefix)) {
            const key = decodeURIComponent(stored.slice(prefix.length));
            result[key] = await read(key);
          }
          return result;
        }),
    };
  }
  async openBox(name, props) {
    text(name, 'Box name');
    if (Object.keys(props).length) throw Error('Custom Hive box options require a native host.');
    if (!this.hivePath) throw Error('Call Hive.initDartNative before opening a box.');
    const key = `hive:${this.hivePath}:${name}`;
    if (this.boxes.has(key) && !this.boxes.get(key).closed) return this.boxes.get(key).api;
    const state = { closed: false, values: (await this.backend.get(key)) || Object.create(null) };
    this.check();
    const check = () => {
      this.check();
      if (state.closed) throw Error('Hive box is closed.');
    };
    const save = async (change) =>
      this.backend.lock(key, async () => {
        check();
        const values = (await this.backend.get(key)) || Object.create(null);
        const result = change(values);
        if (JSON.stringify(values).length > 1000000)
          throw Error('Preview Hive boxes are limited to 1 MB.');
        await this.backend.put(key, values);
        state.values = values;
        return result;
      });
    state.api = {
      get name() {
        return name;
      },
      get isOpen() {
        return !state.closed;
      },
      get length() {
        check();
        return Object.keys(state.values).length;
      },
      get isEmpty() {
        check();
        return !Object.keys(state.values).length;
      },
      get keys() {
        check();
        return Object.keys(state.values).map((key) =>
          key.startsWith('i:') ? Number(key.slice(2)) : key.slice(2),
        );
      },
      get values() {
        check();
        return Object.values(state.values).map(dartValue);
      },
      get: named(({ defaultValue = null }, [key]) => {
        check();
        return Object.hasOwn(state.values, entryKey(key))
          ? dartValue(state.values[entryKey(key)])
          : defaultValue;
      }),
      containsKey: (key) => {
        check();
        return Object.hasOwn(state.values, entryKey(key));
      },
      put: (key, value) => {
        const saved = copyValue(value);
        return save((values) => {
          values[entryKey(key)] = saved;
          return null;
        });
      },
      delete: (key) =>
        save((values) => {
          delete values[entryKey(key)];
          return null;
        }),
      clear: () =>
        save((values) => {
          const count = Object.keys(values).length;
          for (const key of Object.keys(values)) delete values[key];
          return count;
        }),
      close: async () => {
        state.closed = true;
      },
      flush: async () => {
        check();
      },
    };
    this.boxes.set(key, state);
    return state.api;
  }
  async openDatabase(path, options) {
    path = this.path(path);
    let database = this.databases.get(path);
    if (database && !database.closed) {
      if (options.singleInstance === false)
        throw Error('Multiple SQLite connections within one preview are unsupported.');
      return database.opening;
    }
    database = new PreviewSqlite(this, path);
    this.databases.set(path, database);
    database.opening = database.open(options);
    return database.opening;
  }
  dispose() {
    this.disposed = true;
    for (const box of this.boxes.values()) box.closed = true;
    for (const database of this.databases.values()) database.close();
    this.boxes.clear();
    this.databases.clear();
  }
}
