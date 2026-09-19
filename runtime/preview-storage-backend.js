// Persistent adapters are supplied only by live preview hosts. Validation uses
// a separate memory backend and cannot touch saved projects.
export function memoryStorageBackend() {
  const values = new Map(),
    queues = new Map();
  return {
    kind: 'memory',
    get: async (key) => structuredClone(values.get(key)),
    put: async (key, value) => {
      values.set(key, structuredClone(value));
    },
    delete: async (key) => {
      values.delete(key);
    },
    keys: async (prefix) => [...values.keys()].filter((key) => key.startsWith(prefix)),
    lock(key, action) {
      const previous = queues.get(key) || Promise.resolve();
      const next = previous.catch(() => {}).then(action);
      queues.set(key, next);
      return next.finally(() => {
        if (queues.get(key) === next) queues.delete(key);
      });
    },
  };
}
const sharedDatabases = new WeakMap();
export function indexedDBStorageBackend(namespace, environment = globalThis) {
  if (typeof namespace !== 'string' || !namespace)
    throw Error('Preview storage needs a project namespace.');
  const database = () => {
    if (sharedDatabases.has(environment)) return sharedDatabases.get(environment);
    const opening = new Promise((resolve, reject) => {
      if (!environment.indexedDB) {
        reject(Error('IndexedDB storage is unavailable in this browser.'));
        return;
      }
      const request = environment.indexedDB.open('native-lab-preview-storage', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('values');
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          sharedDatabases.delete(environment);
        };
        resolve(request.result);
      };
      request.onerror = () => {
        sharedDatabases.delete(environment);
        reject(request.error);
      };
      request.onblocked = () => {
        sharedDatabases.delete(environment);
        reject(Error('Another tab is blocking preview storage.'));
      };
    });
    sharedDatabases.set(environment, opening);
    opening.catch(() => sharedDatabases.delete(environment));
    return opening;
  };
  const prefix = `${encodeURIComponent(namespace)}:`;
  const operation = async (mode, action) => {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('values', mode),
        store = tx.objectStore('values');
      let result;
      try {
        const request = action(store);
        request.onsuccess = () => {
          result = request.result;
        };
      } catch (error) {
        tx.abort();
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || Error('Preview storage transaction was aborted.'));
      tx.onerror = () => reject(tx.error);
    });
  };
  return {
    kind: 'indexeddb',
    get: (key) => operation('readonly', (store) => store.get(prefix + key)),
    put: (key, value) => operation('readwrite', (store) => store.put(value, prefix + key)),
    delete: (key) => operation('readwrite', (store) => store.delete(prefix + key)),
    keys: async (keyPrefix) =>
      (
        await operation('readonly', (store) =>
          store.getAllKeys(
            environment.IDBKeyRange.bound(prefix + keyPrefix, prefix + keyPrefix + '\uffff'),
          ),
        )
      ).map((key) => key.slice(prefix.length)),
    lock(key, action) {
      if (!environment.navigator?.locks)
        throw Error('Persistent preview storage requires browser Web Locks support.');
      return environment.navigator.locks.request(`native-lab-storage:${prefix}${key}`, action);
    },
  };
}
