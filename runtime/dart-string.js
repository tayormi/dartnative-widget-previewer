// Dart interpolation and collection.toString must not use JS Object coercion.
export function dartString(value, seen = new Set()) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return String(value);
  if (value instanceof Error) return value.message;
  if (value.symbol) return value.symbol;
  if (seen.has(value)) return '[...]';
  if (Array.isArray(value) || value instanceof Set || Object.getPrototypeOf(value) === null) {
    seen.add(value);
    let text;
    if (Array.isArray(value))
      text = '[' + value.map((item) => dartString(item, seen)).join(', ') + ']';
    else if (value instanceof Set)
      text = '{' + [...value].map((item) => dartString(item, seen)).join(', ') + '}';
    else
      text =
        '{' +
        Object.entries(value)
          .map(([key, item]) => `${key}: ${dartString(item, seen)}`)
          .join(', ') +
        '}';
    seen.delete(value);
    return text;
  }
  return value.name ? `Instance of '${value.name}'` : String(value);
}
