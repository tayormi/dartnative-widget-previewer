const key = 'native-lab-firebase-preview-v1';
const fields = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'measurementId',
];

export function validateFirebasePreviewConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Enter a Firebase web-app configuration object.');
  if (Object.keys(value).some((k) => !['firebaseConfig', 'vapidKey'].includes(k)))
    throw Error('Use firebaseConfig and vapidKey only. Do not enter a service-account key.');
  const input = value.firebaseConfig;
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !fields.includes(k))
  )
    throw Error('firebaseConfig must contain the public web-app settings from Firebase.');
  for (const name of ['apiKey', 'projectId', 'messagingSenderId', 'appId'])
    if (typeof input[name] !== 'string' || !input[name].trim())
      throw Error(`Firebase ${name} is required.`);
  for (const [name, value] of Object.entries(input))
    if (typeof value !== 'string' || value.length > 512 || /[\u0000-\u001f]/.test(value))
      throw Error(`Invalid Firebase ${name}.`);
  if (
    !/^[a-z0-9][a-z0-9-]{3,62}$/.test(input.projectId) ||
    !/^\d{1,30}$/.test(input.messagingSenderId) ||
    !/^1:\d+:web:[A-Za-z0-9]+$/.test(input.appId)
  )
    throw Error('Use a Firebase web app, including its project ID, sender ID and web app ID.');
  const vapidKey = value.vapidKey;
  if (typeof vapidKey !== 'string' || !/^B[A-Za-z0-9_-]{86}$/.test(vapidKey))
    throw Error(
      'Enter the public VAPID key from Firebase Cloud Messaging → Web Push certificates.',
    );
  return {
    firebaseConfig: Object.fromEntries(
      fields.filter((k) => input[k] != null).map((k) => [k, input[k]]),
    ),
    vapidKey,
  };
}
export function readFirebasePreviewConfig(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(key);
    return value ? validateFirebasePreviewConfig(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}
export function saveFirebasePreviewConfig(value, storage = globalThis.localStorage) {
  if (value == null) storage.removeItem(key);
  else storage.setItem(key, JSON.stringify(validateFirebasePreviewConfig(value)));
}
export const firebasePreviewConfigKey = key;
