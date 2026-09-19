import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';

export class Machine extends EventEmitter {
  constructor(child, timeout = 120000) {
    super();
    this.child = child;
    this.timeout = timeout;
    this.pending = new Map();
    this.sequence = 0;
    this.closed = false;
    this.started = false;
    createInterface({ input: child.stdout }).on('line', (line) => this.consume(line));
    createInterface({ input: child.stderr }).on('line', (line) => this.emit('log', line));
    child.on('error', (error) => this.fail(error));
    child.on('exit', (code, signal) => {
      this.fail(new Error(`Native process exited (${code ?? signal})`));
      this.emit('exit', code);
    });
  }
  consume(line) {
    let messages;
    try {
      messages = JSON.parse(line);
    } catch {
      this.emit('log', line);
      return;
    }
    if (!Array.isArray(messages)) {
      this.emit('log', line);
      return;
    }
    for (const message of messages) {
      if (Object.hasOwn(message, 'id')) {
        const pending = this.pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (message.error)
            pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
          else pending.resolve(message.result);
        }
      } else if (message.event) {
        if (message.event === 'app.start') this.appId = message.params.appId;
        if (message.event === 'app.started') this.started = true;
        this.emit('event', message);
        this.emit(message.event, message.params);
      }
    }
  }
  request(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('Native process is not running'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify([{ id, method, params }])}\n`);
    });
  }
  fail(error) {
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }
  async ready(timeout = 240000) {
    if (this.started) return;
    if (this.closed) throw new Error('Native process exited before startup');
    await new Promise((resolve, reject) => {
      const done = (error) => {
        clearTimeout(timer);
        this.off('app.started', success);
        this.off('exit', failure);
        error ? reject(error) : resolve();
      };
      const success = () => done();
      const failure = () => done(new Error('Native process exited before startup'));
      const timer = setTimeout(() => done(new Error('Native startup timed out')), timeout);
      this.once('app.started', success);
      this.once('exit', failure);
    });
  }
  async stop() {
    if (this.closed) return;
    if (this.appId)
      await Promise.race([
        this.request('app.stop', { appId: this.appId }),
        new Promise((r) => setTimeout(r, 4000)),
      ]).catch(() => {});
    if (!this.closed) this.child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (this.closed) return resolve();
      const timer = setTimeout(() => {
        this.child.kill('SIGKILL');
        resolve();
      }, 4000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
