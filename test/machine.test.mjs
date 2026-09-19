import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Machine } from '../lib/machine.mjs';
import { generateHost } from '../lib/generate.mjs';
import { isSimulatorProcess } from '../lib/native-process.mjs';

function setup(timeout = 100) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => child.emit('exit', 0);
  return { child, machine: new Machine(child, timeout) };
}
test('machine matches out-of-order responses and keeps diagnostic lines', async () => {
  const { machine, child } = setup();
  const logs = [];
  machine.on('log', (line) => logs.push(line));
  const first = machine.request('first'),
    second = machine.request('second');
  child.stdout.write(
    'native build log\n[{"id":2,"result":"second"}]\n[{"id":1,"result":"first"}]\n',
  );
  assert.equal(await first, 'first');
  assert.equal(await second, 'second');
  assert.deepEqual(logs, ['native build log']);
});
test('machine propagates protocol errors and process failure', async () => {
  const { machine, child } = setup();
  const request = machine.request('bad');
  child.stdout.write('[{"id":1,"error":{"message":"bad request"}}]\n');
  await assert.rejects(request, /bad request/);
  const pending = machine.request('pending');
  child.emit('exit', 1);
  await assert.rejects(pending, /exited/);
  assert.equal(machine.pending.size, 0);
  await assert.rejects(machine.request('after'), /not running/);
});
test('request timeout releases pending entry', async () => {
  const { machine } = setup(10);
  await assert.rejects(machine.request('slow'), /timed out/);
  assert.equal(machine.pending.size, 0);
});
test('ready requires app.started, not merely app.start', async () => {
  const { machine, child } = setup();
  child.stdout.write('[{"event":"app.start","params":{"appId":"native-app"}}]\n');
  assert.equal(machine.started, false);
  const ready = machine.ready(100);
  child.stdout.write('[{"event":"app.started","params":{"appId":"native-app"}}]\n');
  await ready;
  assert.equal(machine.appId, 'native-app');
});
test('ready fails when process exits before a frame can launch', async () => {
  const { machine, child } = setup();
  const ready = machine.ready(100);
  child.emit('exit', 1);
  await assert.rejects(ready, /before startup/);
});
test('generated native registry imports original source and escapes Dart interpolation', () => {
  const source = generateHost([
    {
      id: 'package:app/a.dart::price$Preview::0',
      uri: 'package:app/a.dart',
      symbol: 'preview',
      width: 320,
      height: 240,
      fullScreen: false,
    },
  ]);
  assert.match(source, /import "package:app\/a.dart" as fixture0;/);
  assert.ok(source.includes('price\\$Preview'));
  assert.ok(source.includes('fixture0.preview'));
  assert.ok(!source.includes('fixture0.main('));
  assert.match(source, /KeyedSubtree/);
});
test('cleanup ownership rejects host processes and another simulator', () => {
  const command =
    '/Library/Developer/CoreSimulator/Devices/owned/data/Containers/Bundle/Application/uuid/Runner.app/Runner';
  assert.equal(isSimulatorProcess(300, command, 'owned'), true);
  assert.equal(isSimulatorProcess(300, command, 'other'), false);
  assert.equal(
    isSimulatorProcess(300, '/Applications/Other.app/Contents/MacOS/Other', 'owned'),
    false,
  );
  assert.equal(isSimulatorProcess(1, command, 'owned'), false);
});
