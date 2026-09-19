// A dependency file travels with source through undo, cloud history and export.
// Catalog versions are tested against the pinned DartNative SDK.
export const packageFile = 'native_lab_packages.dart';
export const packageCatalog = [
  {
    name: 'dartnative_shared_preferences',
    title: 'Preferences',
    version: '1.0.0',
    description: 'Save and load text, numbers and switches on this device.',
    preview: 'Browser storage, isolated to this project. iOS uses native preferences.',
    url: 'https://dartpub.dev/plugins/dartnative_shared_preferences',
    actions: ['save', 'load'],
  },
];
const header = '// @native-lab-packages ';
export function projectPackages(files) {
  if (!files[packageFile]) return {};
  const lines = files[packageFile].split('\n'),
    markers = lines.filter((line) => line.startsWith(header));
  if (markers.length !== 1 || lines.some((line) => line.trim() && !line.startsWith('//')))
    throw Error(
      'The package manifest contains custom code. Restore its catalog format before changing packages.',
    );
  let data;
  try {
    data = JSON.parse(markers[0].slice(header.length));
  } catch {
    throw Error('Invalid package manifest.');
  }
  if (
    data.version !== 1 ||
    !data.dependencies ||
    typeof data.dependencies !== 'object' ||
    Array.isArray(data.dependencies)
  )
    throw Error('Invalid package manifest.');
  for (const [name, version] of Object.entries(data.dependencies))
    if (!packageCatalog.some((p) => p.name === name && p.version === version))
      throw Error(`No tested preview adapter for ${name} ${version}.`);
  return { ...data.dependencies };
}
export function setProjectPackage(files, name, installed) {
  const item = packageCatalog.find((p) => p.name === name);
  if (!item) throw Error('Choose a supported package.');
  const dependencies = projectPackages(files);
  if (installed) dependencies[name] = item.version;
  else {
    const reference = new RegExp(`\\b(?:import|export)\\s+['"]package:${name}/`);
    if (Object.values(files).some((source) => reference.test(source)))
      throw Error('Remove this package’s actions and imports in Code before uninstalling it.');
    delete dependencies[name];
  }
  const next = { ...files };
  if (Object.keys(dependencies).length)
    next[packageFile] =
      `// Managed by Native Lab Packages. Included in source history and exports.\n${header}${JSON.stringify({ version: 1, dependencies })}\n`;
  else delete next[packageFile];
  return next;
}

// Isolated memory storage is the default for validation, tests and AI callback
// probes. Only the live editor explicitly supplies browser storage.
export function createPreferenceStore({ storage = null, namespace = 'validation' } = {}) {
  const prefix = `native-lab:preferences:${encodeURIComponent(namespace)}:`;
  const memory = new Map();
  const keyFor = (key) => {
    if (typeof key !== 'string') throw Error('Preference keys must be text.');
    return prefix + encodeURIComponent(key);
  };
  const read = (key) => {
    const name = keyFor(key);
    let value;
    try {
      value = storage ? storage.getItem(name) : memory.get(name);
    } catch {
      throw Error('Browser preference storage is unavailable.');
    }
    if (value == null) return null;
    try {
      return JSON.parse(value);
    } catch {
      throw Error('Saved preference data is invalid.');
    }
  };
  const valid = (type, value) =>
    type === 'StringList'
      ? Array.isArray(value) && value.every((item) => typeof item === 'string')
      : type === 'String'
        ? typeof value === 'string'
        : type === 'Bool'
          ? typeof value === 'boolean'
          : type === 'Int'
            ? Number.isSafeInteger(value)
            : type === 'Double'
              ? typeof value === 'number' && Number.isFinite(value)
              : false;
  const api = {};
  for (const type of ['String', 'Bool', 'Int', 'Double', 'StringList']) {
    api[`get${type}`] = (key) => {
      const saved = read(key);
      if (saved == null) return null;
      if (saved.type !== type || !valid(type, saved.value))
        throw Error(`Preference ${key} is not a ${type}.`);
      return saved.value;
    };
    api[`set${type}`] = async (key, value) => {
      if (!valid(type, value)) throw Error(`Preference value must be ${type}.`);
      const name = keyFor(key),
        text = JSON.stringify({ type, value });
      try {
        if (storage) storage.setItem(name, text);
        else memory.set(name, text);
      } catch {
        throw Error('Could not save the preference in this browser.');
      }
      return true;
    };
  }
  api.containsKey = (key) => read(key) != null;
  api.remove = async (key) => {
    const name = keyFor(key);
    if (storage) storage.removeItem(name);
    else memory.delete(name);
    return true;
  };
  const keys = () =>
    storage
      ? storage.keys
        ? storage.keys()
        : Array.from({ length: storage.length }, (_, index) => storage.key(index))
      : [...memory.keys()];
  api.getKeys = () =>
    new Set(
      keys()
        .filter((key) => key?.startsWith(prefix))
        .map((key) => decodeURIComponent(key.slice(prefix.length))),
    );
  api.clear = async () => {
    for (const key of api.getKeys()) await api.remove(key);
    return true;
  };
  api.reload = async () => {};
  return api;
}
