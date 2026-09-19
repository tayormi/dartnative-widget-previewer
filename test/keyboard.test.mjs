import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { keyboardEvents, NativeKeyboard } from '../lib/keyboard.mjs';

test('keyboard validates all text before sending and balances modifier keys', () => {
  assert.throws(() => keyboardEvents({ kind: 'text', text: 'before💡after' }), /US keyboard/);
  assert.throws(() => keyboardEvents({ kind: 'text', text: 'x'.repeat(513) }), /Invalid/);
  assert.throws(() => keyboardEvents({ kind: 'key', key: 'constructor' }), /Invalid/);
  const events = keyboardEvents({ kind: 'text', text: 'Aa9!\n' });
  const held = new Set();
  for (const e of events) {
    if (e.type === 'down') held.add(e.usage);
    else assert.ok(held.delete(e.usage));
  }
  assert.equal(held.size, 0);
  assert.equal(events.filter((e) => e.usage === 225).length, 4);
  assert.deepEqual(keyboardEvents({ kind: 'key', key: 'Backspace' }), [
    { type: 'down', usage: 42 },
    { type: 'up', usage: 42 },
  ]);
});
test('keyboard serializes complete keystrokes across requests and closes transport', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const packets = [];
  server.on('connection', (socket) =>
    socket.on('message', (data) => {
      assert.equal(data[0], 6);
      packets.push(JSON.parse(data.subarray(1)));
    }),
  );
  const keyboard = new NativeKeyboard(async () => `ws://127.0.0.1:${server.address().port}`);
  try {
    await Promise.all([
      keyboard.send({ kind: 'text', text: 'A' }),
      keyboard.send({ kind: 'key', key: 'Backspace' }),
    ]);
    assert.deepEqual(packets, [
      ...keyboardEvents({ kind: 'text', text: 'A' }),
      ...keyboardEvents({ kind: 'key', key: 'Backspace' }),
    ]);
    keyboard.close();
    await assert.rejects(keyboard.send({ kind: 'text', text: 'a' }), /stopped/);
  } finally {
    keyboard.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
