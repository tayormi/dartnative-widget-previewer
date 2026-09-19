const genericFamilies = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'fangsong',
]);
// A quoted CSS generic is a literal font name, which silently falls back to
// the browser default when that named font is missing.
export function fontFamilyCSS(family) {
  const name = String(family);
  return genericFamilies.has(name.toLowerCase()) ? name.toLowerCase() : JSON.stringify(name);
}
