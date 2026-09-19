// Keep a Dart Future as a value until an explicit await. JS async functions
// otherwise adopt it automatically, suspending even unawaited navigation.
import { durationMilliseconds } from './preview-controllers.js';
export class DartFuture {
  #promise;
  #active;
  #ownCleanup;
  constructor(promise, active = () => true, ownCleanup = null) {
    this.#promise = promise;
    this.#active = active;
    this.#ownCleanup = ownCleanup;
    this.valueType = 'Future';
  }
  unwrap() {
    return this.#promise;
  }
  invoke(name, args, props = {}) {
    if (name === 'then') {
      if (args.length !== 1 || typeof args[0] !== 'function' || Object.keys(props).length)
        throw Error('Future.then currently accepts one callback.');
      return new DartFuture(
        this.#promise.then((value) => (this.#active() ? unwrapFuture(args[0](value)) : null)),
        this.#active,
        this.#ownCleanup,
      );
    }
    if (name === 'timeout') {
      const ms = durationMilliseconds(args[0]);
      if (
        args.length !== 1 ||
        !Number.isFinite(ms) ||
        ms < 0 ||
        ms > 2147483647 ||
        Object.keys(props).some((k) => k !== 'onTimeout') ||
        (props.onTimeout != null && typeof props.onTimeout !== 'function')
      )
        throw Error('Invalid Future timeout.');
      let timer, cancel;
      const expiry = new Promise((resolve, reject) => {
        cancel = () => {
          clearTimeout(timer);
          resolve(null);
        };
        timer = setTimeout(() => {
          if (!this.#active()) {
            resolve(null);
            return;
          }
          try {
            if (!props.onTimeout) throw Error('Future timed out.');
            resolve(unwrapFuture(props.onTimeout()));
          } catch (error) {
            reject(error);
          }
        }, ms);
      });
      const release = this.#ownCleanup?.(cancel),
        result = Promise.race([this.#promise, expiry]).finally(() => {
          clearTimeout(timer);
          release?.();
        });
      result.catch(() => {});
      return new DartFuture(result, this.#active, this.#ownCleanup);
    }
    throw Error(`Unsupported Future method: ${name}`);
  }
}
export const unwrapFuture = (value) => (value instanceof DartFuture ? value.unwrap() : value);
