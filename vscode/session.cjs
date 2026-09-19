const path = require('node:path');
const fs = require('node:fs/promises');

function localURL(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Preview port must be between 1024 and 65535.');
  return `http://127.0.0.1:${port}`;
}
async function request(base, route, body) {
  const response = await fetch(base + route, {
    method: body ? 'POST' : 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(body ? 180000 : 3000),
    ...(body
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Preview request failed (${response.status})`);
  return result;
}
async function readSession(base, project) {
  const state = await request(base, '/api/state');
  if (state.protocol !== 'dn-widget-previewer/1' || state.projectRoot !== project) {
    throw new Error(
      'This port belongs to another project or an incompatible preview controller. Choose a different preview port.',
    );
  }
  return state;
}
function within(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}
async function sourceFile(project, file) {
  if (typeof file !== 'string' || path.isAbsolute(file) || !file.endsWith('.dart'))
    throw new Error('Invalid preview source');
  const resolved = await fs.realpath(path.resolve(project, file));
  if (!within(project, resolved)) throw new Error('Preview source must be inside the project');
  return resolved;
}
module.exports = { localURL, request, readSession, sourceFile };
