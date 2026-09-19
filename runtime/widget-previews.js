import { Runtime } from './runtime.js';

const literal = (value) => ({ kind: 'literal', value });
const call = (name, args = [], named = {}) => ({ kind: 'call', name, args, named });
export function sampleValues(preview) {
  return Object.fromEntries(preview.inputs.map((p) => [p.name, p.value]));
}
function validateValue(input, value) {
  const type = input.type.replace(/\?$/, '');
  if (value === null && input.type.endsWith('?')) return;
  if (input.kind === 'enum') {
    if (
      !/^[A-Za-z][A-Za-z0-9_]*$/.test(type) ||
      !input.options?.includes(value) ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
    )
      throw Error(`${input.name} needs a declared ${type} value.`);
    return;
  }
  const valid =
    type === 'String'
      ? typeof value === 'string'
      : type === 'bool'
        ? typeof value === 'boolean'
        : type === 'Color'
          ? Number.isInteger(value) && value >= 0 && value <= 0xffffffff
          : type === 'int'
            ? Number.isSafeInteger(value)
            : typeof value === 'number' && Number.isFinite(value);
  if (!valid) throw Error(`${input.name} needs a ${input.type} value.`);
}
export function previewExpression(preview, values) {
  if (!preview?.sampleable)
    throw Error(preview?.problems?.join(' ') || 'Choose a previewable widget.');
  const named = {};
  for (const input of preview.inputs) {
    const value = values[input.name];
    validateValue(input, value);
    named[input.name] =
      input.kind === 'enum' && value !== null
        ? { kind: 'get', target: { kind: 'ref', name: input.type.replace(/\?$/, '') }, name: value }
        : input.type.replace(/\?$/, '') === 'Color' && value !== null
          ? call('Color', [literal(value)])
          : literal(value);
  }
  return {
    ...call(preview.name, [], named),
    file: preview.file,
    start: preview.start,
    end: preview.end,
  };
}
export function previewRoot(preview, values, { fullScreen = false } = {}) {
  const widget = previewExpression(preview, values);
  return fullScreen
    ? widget
    : call('Scaffold', [], {
        backgroundColor: call('Color', [literal(0xffffffff)]),
        appBar: call('AppBar', [], { title: call('Text', [literal(preview.name)]) }),
        body: call('ListView', [], {
          padding: call('EdgeInsets.all', [literal(24)]),
          children: { kind: 'list', items: [widget] },
        }),
      });
}
export function createPreviewSession(model, preview, values, onChange, options = {}) {
  // Each variant owns its globals, notifiers and routes. Live hosts may provide
  // persistent storage isolated to that variant; tests default to memory.
  return new Runtime(
    { ...model, root: previewRoot(preview, values, options) },
    onChange,
    options.runtimeOptions,
  );
}
const dartString = (value) => JSON.stringify(value).replaceAll('$', '\\$');
function dartValue(input, value) {
  validateValue(input, value);
  if (value === null) return 'null';
  if (input.kind === 'enum') return `${input.type.replace(/\?$/, '')}.${value}`;
  switch (input.type.replace(/\?$/, '')) {
    case 'String':
      return dartString(value);
    case 'Color':
      return `const Color(0x${value.toString(16).padStart(8, '0')})`;
    default:
      return String(value);
  }
}
export function previewProject(
  files,
  preview,
  values,
  { fullScreen = false, initializers = [] } = {},
) {
  previewExpression(preview, values);
  const safe = (path) =>
    /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.dart$/.test(path) &&
    !path.split('/').some((p) => p === '.' || p === '..');
  if (!safe(preview.file) || !Object.hasOwn(files, preview.file))
    throw Error('The widget source is no longer available.');
  const expression = `${preview.name}(${preview.inputs.map((p) => `${p.name}: ${dartValue(p, values[p.name])}`).join(', ')})`;
  const root = fullScreen
    ? expression
    : `Scaffold(\n    backgroundColor: const Color(0xFFFFFFFF),\n    appBar: AppBar(title: Text(${dartString(preview.name)})),\n    body: ListView(padding: const EdgeInsets.all(24), children: [${expression}]),\n  )`;
  const result = {
    'main.dart': `// Generated preview host. Your original files are preserved under source/.\nimport 'package:dartnative/dartnative.dart';\nimport 'source/${preview.file}';\nimport 'dartnative_plugin_registrant.dart';\n\nvoid main() {\n  DartNativePluginRegistrant.registerAll();\n  runApp(${root});\n}\n`,
  };
  for (const file of new Set(
    preview.inputs
      .filter((input) => input.kind === 'enum' && input.enumFile !== preview.file)
      .map((input) => input.enumFile),
  )) {
    if (!safe(file) || !Object.hasOwn(files, file))
      throw Error('The enum source is no longer available.');
    result['main.dart'] = `import 'source/${file}';\n` + result['main.dart'];
  }
  for (const [file, source] of Object.entries(files)) {
    if (!safe(file)) throw Error('Unsupported source filename.');
    if (file.endsWith('dartnative_plugin_registrant.dart')) continue;
    // Keep relative imports intact. The SDK supplies the registrant at lib/.
    result[`source/${file}`] = source.replace(
      /(['"])((?:\.\.\/)*|\.\/)?dartnative_plugin_registrant\.dart\1/g,
      (_, quote) =>
        `${quote}${'../'.repeat(file.split('/').length)}dartnative_plugin_registrant.dart${quote}`,
    );
  }
  if (files['native_lab_packages.dart'])
    result['native_lab_packages.dart'] = files['native_lab_packages.dart'];
  // Preserve setup before runApp in its original library, including private
  // routes, theme assignments, and awaited service initialization.
  for (const [index, setup] of initializers.entries()) {
    if (!safe(setup.file) || !Object.hasOwn(files, setup.file) || typeof setup.source !== 'string')
      throw Error('Invalid preview initialization.');
    let name = `nativeLabPreviewSetup${index}`;
    while (Object.values(files).some((source) => source.includes(name))) name += 'Next';
    result[`source/${setup.file}`] +=
      `\n// Generated preview initialization.\n${setup.async ? 'Future<void>' : 'void'} ${name}() ${setup.async ? 'async ' : ''}{\n  ${setup.source}\n}\n`;
    if (setup.file !== preview.file)
      result['main.dart'] = `import 'source/${setup.file}';\n` + result['main.dart'];
    if (setup.async)
      result['main.dart'] = result['main.dart'].replace(
        'void main() {',
        'Future<void> main() async {',
      );
    result['main.dart'] = result['main.dart'].replace(
      '  runApp(',
      `  ${setup.async ? 'await ' : ''}${name}();\n  runApp(`,
    );
  }
  return result;
}

export const playgroundHandoffKey = 'native-lab-playground-handoff-v1';
export const playgroundDraftKey = 'native-lab-playground-editor-v1';
export function readPlaygroundHandoff(storage) {
  const text = storage.getItem(playgroundHandoffKey);
  if (!text) return null;
  const data = JSON.parse(text);
  if (!data?.files?.['main.dart'] || Object.values(data.files).some((v) => typeof v !== 'string'))
    throw Error('The playground handoff is invalid. Export your source and import it again.');
  storage.removeItem(playgroundHandoffKey);
  return data;
}
