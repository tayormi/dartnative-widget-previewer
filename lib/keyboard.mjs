import WebSocket from 'ws';
import { setTimeout as delay } from 'node:timers/promises';

const special = {
  Enter: 40,
  Escape: 41,
  Backspace: 42,
  Tab: 43,
  Delete: 76,
  Home: 74,
  End: 77,
  ArrowRight: 79,
  ArrowLeft: 80,
  ArrowDown: 81,
  ArrowUp: 82,
};
const punctuation = {
  ' ': 44,
  '-': 45,
  '=': 46,
  '[': 47,
  ']': 48,
  '\\': 49,
  ';': 51,
  "'": 52,
  '`': 53,
  ',': 54,
  '.': 55,
  '/': 56,
  '\n': 40,
  '\t': 43,
};
const shifted = {
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  _: '-',
  '+': '=',
  '{': '[',
  '}': ']',
  '|': '\\',
  ':': ';',
  '"': "'",
  '~': '`',
  '<': ',',
  '>': '.',
  '?': '/',
};

// Validate the whole text before sending any events, so an unsupported character
// never produces a partially typed string. The transport uses a US HID layout.
export function keyboardEvents(input) {
  let keys;
  if (input?.kind === 'key' && Object.hasOwn(special, input.key)) {
    keys = [{ usage: special[input.key], shift: input.shift === true }];
  } else if (
    input?.kind === 'text' &&
    typeof input.text === 'string' &&
    input.text.length > 0 &&
    input.text.length <= 512
  ) {
    keys = Array.from(input.text.replace(/\r\n?/g, '\n'), (character) => {
      const base = shifted[character] ?? character.toLowerCase();
      const usage = /^[a-z]$/.test(base)
        ? base.charCodeAt(0) - 93
        : /^[1-9]$/.test(base)
          ? Number(base) + 29
          : base === '0'
            ? 39
            : punctuation[base];
      if (usage === undefined)
        throw new Error(
          'Desktop input supports the US keyboard layout. Use the iOS keyboard for other characters.',
        );
      return { usage, shift: shifted[character] !== undefined || /^[A-Z]$/.test(character) };
    });
  } else throw new Error('Invalid keyboard input');
  return keys.flatMap(({ usage, shift }) => [
    ...(shift ? [{ type: 'down', usage: 225 }] : []),
    { type: 'down', usage },
    { type: 'up', usage },
    ...(shift ? [{ type: 'up', usage: 225 }] : []),
  ]);
}

export class NativeKeyboard {
  constructor(resolveURL) {
    this.resolveURL = resolveURL;
    this.queue = Promise.resolve();
    this.closed = false;
  }
  send(input) {
    const events = keyboardEvents(input);
    const job = this.queue.then(async () => {
      if (this.closed) throw new Error('Keyboard transport stopped');
      if (this.socket?.readyState !== WebSocket.OPEN) {
        const url = new URL(await this.resolveURL());
        if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1')
          throw new Error('Expected local simulator transport');
        this.socket = new WebSocket(url);
        this.socket.on('error', () => {});
        const socket = this.socket;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.terminate();
            reject(new Error('Keyboard connection timed out'));
          }, 3000);
          socket.once('open', () => {
            clearTimeout(timeout);
            resolve();
          });
          socket.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      }
      for (const event of events) {
        const packet = Buffer.concat([Buffer.from([6]), Buffer.from(JSON.stringify(event))]);
        await new Promise((resolve, reject) =>
          this.socket.send(packet, (error) => (error ? reject(error) : resolve())),
        );
        await delay(8);
      }
    });
    this.queue = job.catch(() => {});
    return job;
  }
  close() {
    this.closed = true;
    this.socket?.terminate();
  }
}
