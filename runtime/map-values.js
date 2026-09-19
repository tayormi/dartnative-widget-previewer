export const mapTypes = ['none', 'normal', 'satellite', 'terrain', 'hybrid'];
export const mapCalls = new Set([
  'LatLng',
  'CameraPosition',
  'Marker',
  'initializeGoogleMapsPlugin',
]);
export function coordinates(value) {
  if (!value || ![value.latitude, value.longitude].every(Number.isFinite))
    throw Error('Map coordinates must be finite numbers.');
  return { latitude: value.latitude, longitude: value.longitude };
}
export function cameraPosition(value) {
  const point = coordinates(value);
  if (!Number.isFinite(value.zoom)) throw Error('Map zoom must be a finite number.');
  return { ...point, zoom: value.zoom };
}
export class MapValue {
  constructor(type, fields) {
    this.valueType = type;
    Object.assign(this, fields);
    Object.freeze(this);
  }
  read(name) {
    if (['latitude', 'longitude', 'zoom', 'id'].includes(name) && Object.hasOwn(this, name))
      return this[name];
    throw Error(`Unsupported ${this.valueType}.${name}.`);
  }
  toString() {
    return this.valueType === 'LatLng'
      ? `LatLng(${this.latitude}, ${this.longitude})`
      : `Instance of '${this.valueType}'`;
  }
}
export function createMapValue(name, args, props) {
  if (name === 'initializeGoogleMapsPlugin') return null;
  const fields = name === 'LatLng' ? { latitude: args[0], longitude: args[1] } : { ...props };
  delete fields.key;
  coordinates(fields);
  if (name === 'CameraPosition') {
    fields.zoom ??= 10;
    cameraPosition(fields);
  }
  if (name === 'Marker' && typeof fields.id !== 'string')
    throw Error('Marker.id must be a string.');
  return new MapValue(name, fields);
}
// Only these serializable values cross into the provider frame. Dart callbacks
// stay in the owning runtime and are looked up again when an event arrives.
export function mapProperties(props) {
  if (
    !(props.initialCameraPosition instanceof MapValue) ||
    props.initialCameraPosition.valueType !== 'CameraPosition'
  )
    throw Error('GoogleMaps needs a CameraPosition.');
  const type = props.mapType?.symbol ?? 'MapType.normal';
  if (!mapTypes.some((t) => type === `MapType.${t}`)) throw Error('Invalid MapType.');
  const markers = props.markers ?? [];
  if (!Array.isArray(markers) || markers.length > 1000)
    throw Error('A browser map supports up to 1,000 markers.');
  const ids = new Set();
  const output = markers.map((marker) => {
    if (!(marker instanceof MapValue) || marker.valueType !== 'Marker')
      throw Error('GoogleMaps.markers must contain Marker values.');
    if (ids.has(marker.id)) throw Error('Map marker IDs must be unique.');
    ids.add(marker.id);
    return { id: marker.id, ...coordinates(marker) };
  });
  for (const key of ['zoomGesturesEnabled', 'scrollGesturesEnabled'])
    if (props[key] != null && typeof props[key] !== 'boolean')
      throw Error(`${key} must be a boolean.`);
  for (const key of ['onMapReady', 'onMarkerTap', 'onCameraMove'])
    if (props[key] != null && typeof props[key] !== 'function')
      throw Error(`${key} must be a callback.`);
  return {
    camera: cameraPosition(props.initialCameraPosition),
    mapType: type.slice(8),
    markers: output,
    zoomGesturesEnabled: props.zoomGesturesEnabled ?? true,
    scrollGesturesEnabled: props.scrollGesturesEnabled ?? true,
  };
}
export function validateMapState(value) {
  if (
    !value ||
    !mapTypes.includes(value.mapType) ||
    typeof value.zoomGesturesEnabled !== 'boolean' ||
    typeof value.scrollGesturesEnabled !== 'boolean' ||
    !Array.isArray(value.markers) ||
    value.markers.length > 1000
  )
    throw Error('Invalid map state.');
  const ids = new Set();
  return {
    camera: cameraPosition(value.camera),
    mapType: value.mapType,
    zoomGesturesEnabled: value.zoomGesturesEnabled,
    scrollGesturesEnabled: value.scrollGesturesEnabled,
    markers: value.markers.map((m) => {
      if (typeof m?.id !== 'string' || m.id.length > 4096 || ids.has(m.id))
        throw Error('Invalid marker ID.');
      ids.add(m.id);
      return { id: m.id, ...coordinates(m) };
    }),
  };
}
