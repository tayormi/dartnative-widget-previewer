import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { get } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPreviewServer } from '../lib/server.mjs';

async function start(t) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'dn-preview-http-'));
  const project = path.join(temporary, 'project');
  await mkdir(project);
  await writeFile(path.join(project, 'cover.png'), 'preview image');
  await writeFile(path.join(project, 'private.dart'), 'source');
  await writeFile(path.join(temporary, 'outside.png'), 'outside');
  await symlink(path.join(temporary, 'outside.png'), path.join(project, 'escaped.png'));
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const actions = [],
    inputs = [];
  const server = createPreviewServer({
    port,
    root: path.resolve('.'),
    project,
    getState: () => ({ sourceRevision: 3, status: 'ready' }),
    getSourceFiles: () => ({ 'preview.dart': 'Widget sample() => Text("Example");' }),
    getMiddleware: () => null,
    listDevices: async () => [],
    onAction: async (input) => actions.push(input),
    onInput: async (input) => inputs.push(input),
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  });
  return { url: `http://127.0.0.1:${port}`, actions, inputs };
}

test('HTTP serves preview modules and forwards actions without changing the protocol', async (t) => {
  const { url, actions, inputs } = await start(t);
  const state = await fetch(url + '/api/state');
  assert.equal(state.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await state.json(), { sourceRevision: 3, status: 'ready' });
  assert.equal((await (await fetch(url + '/api/project')).json()).revision, 3);
  assert.deepEqual(await (await fetch(url + '/api/devices')).json(), []);
  for (const file of ['/', '/app.js', '/api.js', '/preview-card.js', '/style.css']) {
    const response = await fetch(url + file);
    assert.equal(response.status, 200, file);
    assert.ok((await response.text()).length, file);
  }
  for (const [route, body] of [
    ['action', { action: 'reset' }],
    ['input', { previewId: 'sample', kind: 'text', text: 'Hello' }],
  ]) {
    const response = await fetch(url + '/api/' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.deepEqual(await response.json(), { ok: true });
  }
  assert.deepEqual(actions, [{ action: 'reset' }]);
  assert.equal(inputs[0].text, 'Hello');
});

test('HTTP preserves origin, payload, and project asset boundaries', async (t) => {
  const { url } = await start(t);
  assert.equal(
    (await fetch(url + '/api/state', { headers: { Origin: 'https://other.example' } })).status,
    403,
  );
  const status = await new Promise((resolve, reject) => {
    get(url + '/api/state', { headers: { Host: 'other.example' } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(status, 403);
  assert.equal((await fetch(url + '/api/action', { method: 'POST', body: '{}' })).status, 415);
  const post = (body) =>
    fetch(url + '/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  assert.equal((await post('x'.repeat(8193))).status, 413);
  const malformed = await post('{');
  assert.equal(malformed.status, 400);
  assert.equal(typeof (await malformed.json()).error, 'string');
  assert.equal(await (await fetch(url + '/api/asset?path=cover.png')).text(), 'preview image');
  for (const file of ['../outside.png', 'escaped.png', 'private.dart']) {
    assert.equal(
      (await fetch(url + '/api/asset?path=' + encodeURIComponent(file))).status,
      400,
      file,
    );
  }
  assert.equal((await fetch(url + '/missing')).status, 404);
});
