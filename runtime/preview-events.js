import { DartFuture } from './dart-future.js';

// Host events expose Dart stream operations without exposing their producer.
export class PreviewEventStream {
  constructor(runtime, { onListen = () => {}, onIdle = () => {} } = {}) {
    this.runtime = runtime;
    this.records = new Set();
    this.closed = false;
    this.onListen = onListen;
    this.onIdle = onIdle;
  }
  subscribe(record) {
    if (this.closed) throw Error('The preview event stream is closed.');
    if (this.records.size >= 64) throw Error('Too many preview event subscriptions.');
    this.records.add(record);
    try {
      if (this.records.size === 1) this.onListen();
    } catch (error) {
      this.records.delete(record);
      throw error;
    }
    return () => {
      this.records.delete(record);
      if (!this.records.size) this.onIdle();
    };
  }
  emit(value) {
    if (!this.closed)
      for (const record of [...this.records])
        if (!record.paused && this.records.has(record)) record.data(value);
  }
  error(error) {
    if (!this.closed)
      for (const record of [...this.records])
        if (!record.paused && this.records.has(record)) record.error?.(error);
  }
  invoke(name, args, props = {}) {
    if (name === 'firstWhere') {
      if (
        args.length !== 1 ||
        typeof args[0] !== 'function' ||
        Object.keys(props).some((k) => k !== 'orElse') ||
        (props.orElse != null && typeof props.orElse !== 'function')
      )
        throw Error('Stream.firstWhere needs a predicate and an optional orElse callback.');
      const epoch = this.runtime.epoch;
      const promise = new Promise((resolve, reject) => {
        let cancel = () => {};
        const finish = (fn, value) => {
          cancel();
          fn(value);
        };
        cancel = this.subscribe({
          data: (value) => {
            try {
              if (args[0](value)) finish(resolve, value);
            } catch (error) {
              finish(reject, error);
            }
          },
          error: (error) => finish(reject, error),
          done: () => {
            try {
              finish(
                resolve,
                props.orElse
                  ? props.orElse()
                  : (() => {
                      throw Error('No matching stream event.');
                    })(),
              );
            } catch (error) {
              finish(reject, error);
            }
          },
        });
      });
      // Unawaited native event futures must not become ambient JS rejections.
      promise.catch(() => {});
      return new DartFuture(
        promise,
        () => !this.runtime.disposed && this.runtime.epoch === epoch,
        (fn) => {
          this.runtime.cleanups.add(fn);
          return () => this.runtime.cleanups.delete(fn);
        },
      );
    }
    if (name === 'listen') {
      if (
        args.length !== 1 ||
        typeof args[0] !== 'function' ||
        Object.keys(props).some((k) => !['onError', 'onDone', 'cancelOnError'].includes(k)) ||
        ['onError', 'onDone'].some((k) => props[k] != null && typeof props[k] !== 'function')
      )
        throw Error('Invalid stream subscription.');
      let cancel = () => {};
      const record = {
        paused: false,
        data: (value) => this.runtime.runAction(args[0], [value], false),
        error: (error) => {
          if (props.onError) this.runtime.runAction(props.onError, [String(error)], false);
          if (props.cancelOnError) cancel();
        },
        done: () => {
          cancel();
          if (props.onDone) this.runtime.runAction(props.onDone, [], false);
        },
      };
      cancel = this.subscribe(record);
      return {
        cancel: () => {
          cancel();
          return Promise.resolve(null);
        },
        pause: () => {
          record.paused = true;
        },
        resume: () => {
          record.paused = false;
        },
        get isPaused() {
          return record.paused;
        },
      };
    }
    throw Error(`Unsupported event stream method: ${name}`);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const record of [...this.records]) record.done?.();
    this.records.clear();
    this.onIdle();
  }
}
