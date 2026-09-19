import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs, resolveToolchain, checkNode, checkProject } from '../lib/toolchain.mjs';

test('CLI rejects missing values, unknown options and unsupported Node versions', () => {
  assert.throws(() => parseArgs(['--dn'], ['--dn']), /requires a value/);
  assert.throws(() => parseArgs(['--dn', '--help'], ['--dn'], ['--help']), /requires a value/);
  assert.throws(() => parseArgs(['--wrong']), /Unknown option/);
  assert.deepEqual(parseArgs(['--dn', '/a path/dn', './demo'], ['--dn']), {
    dn: '/a path/dn',
    positionals: ['./demo'],
  });
  assert.throws(() => checkNode('20.0.0'), /22 or later/);
});

test('SDK discovery follows PATH symlinks, honors explicit paths, and rejects incomplete SDKs', async () => {
  const temp = await realpath(await mkdtemp(path.join(tmpdir(), 'dn-setup-')));
  try {
    const bin = path.join(temp, 'SDK with spaces/bin'),
      commands = path.join(temp, 'commands');
    await mkdir(path.join(bin, 'cache/dart-sdk/bin'), { recursive: true });
    await mkdir(path.join(bin, 'cache/pkg/dartnative'), { recursive: true });
    await mkdir(commands);
    await writeFile(path.join(bin, 'dn'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await writeFile(
      path.join(bin, 'cache/dart-sdk/bin/dart'),
      '#!/bin/sh\necho "Dart SDK version: 3.12.0 (test)"\n',
      { mode: 0o755 },
    );
    await writeFile(path.join(bin, 'cache/pkg/dartnative/pubspec.yaml'), 'name: dartnative\n');
    await symlink(path.join(bin, 'dn'), path.join(commands, 'dn'));
    const options = { env: { PATH: commands }, saved: {} };
    const found = await resolveToolchain(options);
    assert.equal(found.dn, path.join(bin, 'dn'));
    assert.equal(
      (await resolveToolchain({ ...options, env: { PATH: '' }, saved: { dn: found.dn } })).dn,
      found.dn,
    );
    await assert.rejects(
      resolveToolchain({ ...options, dn: '/missing/sdk/dn' }),
      /supplied SDK path/,
    );
    await rm(path.join(bin, 'cache/pkg/dartnative/pubspec.yaml'));
    await assert.rejects(resolveToolchain(options), /not found/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('project preflight explains missing dependency resolution and annotation package', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'dn-project-'));
  try {
    await writeFile(path.join(temp, 'pubspec.yaml'), 'name: app\n');
    await mkdir(path.join(temp, 'lib'));
    await assert.rejects(checkProject(temp), /dn pub get/);
    await mkdir(path.join(temp, '.dart_tool'));
    const config = path.join(temp, '.dart_tool/package_config.json');
    await writeFile(config, JSON.stringify({ packages: [{ name: 'dartnative' }] }));
    await assert.rejects(checkProject(temp), /annotation dependency/);
    await writeFile(
      config,
      JSON.stringify({ packages: [{ name: 'dartnative' }, { name: 'dartnative_preview' }] }),
    );
    await checkProject(temp);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
