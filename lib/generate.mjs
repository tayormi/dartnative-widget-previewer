import { readFileSync } from 'node:fs';

const hostTemplate = readFileSync(new URL('./native-host.dart.template', import.meta.url), 'utf8');
const dartString = (value) => JSON.stringify(value).replaceAll('$', '\\$');
export function generateHost(previews) {
  const imports = previews.map((p, i) => `import ${dartString(p.uri)} as fixture${i};`);
  const callback = (p, i, key) => {
    if (!p[key]) return 'null';
    const alias = `callback${i}${key}`;
    imports.push(`import ${dartString(p[key].uri)} as ${alias};`);
    return `${alias}.${p[key].symbol}`;
  };
  const entries = previews
    .map(
      (p, i) =>
        `_Fixture(${dartString(p.id)}, ${p.width}, ${p.height}, ${p.fullScreen}, ${p.textScaleFactor ?? 1}, Brightness.${p.brightness || 'light'}, () => fixture${i}.${p.symbol}(), ${callback(p, i, 'wrapper')}, ${callback(p, i, 'theme')}, ${callback(p, i, 'localizations')})`,
    )
    .join(',\n');
  return hostTemplate
    .replace('// PREVIEW_IMPORTS', () => imports.join('\n'))
    .replace('// PREVIEW_ENTRIES', () => entries);
}
