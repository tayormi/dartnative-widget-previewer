export const mapsPreviewConfigKey = 'native-lab-maps-preview-v1';
export function validateMapsPreviewConfig(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !['apiKey', 'mapId'].includes(k))
  )
    throw Error('Use a Google Maps browser API key and optional map ID.');
  if (typeof value.apiKey !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(value.apiKey))
    throw Error('Enter a Google Maps JavaScript API key.');
  if (
    value.mapId != null &&
    value.mapId !== '' &&
    !/^(?:[a-fA-F0-9]{16,32}|DEMO_MAP_ID)$/.test(value.mapId)
  )
    throw Error('Enter a Google Maps map ID, or leave it empty to use Google’s demo map ID.');
  return { apiKey: value.apiKey, mapId: value.mapId || 'DEMO_MAP_ID' };
}
export function readMapsPreviewConfig(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(mapsPreviewConfigKey);
    return value ? validateMapsPreviewConfig(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}
export function saveMapsPreviewConfig(value, storage = globalThis.localStorage) {
  if (value == null) storage.removeItem(mapsPreviewConfigKey);
  else storage.setItem(mapsPreviewConfigKey, JSON.stringify(validateMapsPreviewConfig(value)));
}
