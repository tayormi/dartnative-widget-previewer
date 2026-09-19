import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import session from '../vscode/session.cjs';

test('IDE session refuses a different project, protocol and invalid ports', async () => {
  for (const port of [0, 80, 65536, NaN]) assert.throws(() => session.localURL(port));
  let state = { protocol: 'other', projectRoot: '/project' };
  const server = createServer((_req, res) => res.end(JSON.stringify(state)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = session.localURL(server.address().port);
  try {
    await assert.rejects(session.readSession(base, '/project'), /incompatible/);
    state.protocol = 'dn-widget-previewer/1';
    await assert.rejects(session.readSession(base, '/other'), /another project/);
    assert.deepEqual(await session.readSession(base, '/project'), state);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
test('source navigation rejects traversal, absolute paths and escaping symlinks', async () => {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'dn-ide-')));
  try {
    const root = path.join(dir, 'app');
    await mkdir(root);
    await writeFile(path.join(root, 'good.dart'), '');
    await writeFile(path.join(dir, 'outside.dart'), '');
    await symlink(path.join(dir, 'outside.dart'), path.join(root, 'link.dart'));
    assert.equal(await session.sourceFile(root, 'good.dart'), path.join(root, 'good.dart'));
    for (const file of ['../outside.dart', 'link.dart', '/absolute.dart', 'package.json'])
      await assert.rejects(session.sourceFile(root, file));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
