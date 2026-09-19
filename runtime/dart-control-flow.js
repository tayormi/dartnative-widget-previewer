import { runNumericLoop } from './numeric-loop.js';
import { DartTypedList } from './typed-data.js';
import { ownedStream } from './preview-streams.js';
import { Env, isDartType } from './dart-environment.js';
export class Completion {}
export class ReturnValue extends Completion {
  constructor(value) {
    super();
    this.value = value;
  }
}
export class LoopFlow extends Completion {
  constructor(kind) {
    super();
    this.kind = kind;
  }
}
export const equal = (a, b) => (a?.symbol && b?.symbol ? a.symbol === b.symbol : a === b);
export function bindPattern(runtime, pattern, value, scope) {
  if (!pattern) return false;
  if (pattern.kind === 'wildcard') return true;
  if (pattern.kind === 'binding') {
    scope.values[pattern.name] = value;
    return true;
  }
  if (pattern.kind === 'constant') return equal(value, runtime.eval(pattern.value, scope));
  if (pattern.kind === 'recordPattern') {
    if (!value?.record) return false;
    let index = 0;
    for (const field of pattern.fields) {
      const item = field.name ? value.named[field.name] : value.record[index++];
      if (!bindPattern(runtime, field.pattern, item, scope)) return false;
    }
    return true;
  }
  throw Error(`Unsupported Dart pattern: ${pattern.source || pattern.kind}`);
}
export function runLoop(runtime, n, env) {
  if (runNumericLoop(runtime, n, env)) return null;
  let scope = new Env({}, env),
    result = [];
  const collect = (value) => {
    if (n.kind === 'forElement')
      result.push(
        ...(['spread', 'ifElement', 'forElement'].includes(n.body.kind) ? value : [value]),
      );
  };
  if (n.items) {
    const iterable = runtime.eval(n.items, env);
    if (
      !Array.isArray(iterable) &&
      !(iterable instanceof Set) &&
      !(iterable instanceof DartTypedList)
    )
      throw Error('A collection loop requires an iterable.');
    for (const item of iterable) {
      runtime.tick();
      const local = new Env({}, scope);
      bindPattern(runtime, n.pattern || { kind: 'binding', name: n.name }, item, local);
      const value = runtime.eval(n.body, local);
      if (value instanceof ReturnValue) return value;
      if (value instanceof LoopFlow) {
        if (value.kind === 'break') break;
        continue;
      }
      collect(value);
    }
  } else {
    runtime.eval(n.initialize, scope);
    let first = true;
    while ((n.doFirst && first) || !n.condition || runtime.eval(n.condition, scope)) {
      runtime.tick();
      first = false;
      const value = runtime.eval(n.body, scope);
      if (value instanceof ReturnValue) return value;
      if (value instanceof LoopFlow && value.kind === 'break') break;
      collect(value);
      // Each iteration captures its own Dart loop variables in callbacks.
      scope = new Env({ ...scope.values }, env);
      for (const update of n.updates || []) runtime.eval(update, scope);
    }
  }
  return n.kind === 'forElement' ? result : null;
}
export async function runLoopAsync(runtime, n, env, epoch) {
  if (runNumericLoop(runtime, n, env)) return null;
  let scope = new Env({}, env),
    result = [];
  const evaluate = (node, local = scope) => runtime.evalAsync(node, local, epoch);
  const collect = (value) => {
    if (n.kind === 'forElement')
      result.push(
        ...(['spread', 'ifElement', 'forElement'].includes(n.body.kind) ? value : [value]),
      );
  };
  if (n.items) {
    const source = await evaluate(n.items, env),
      iterable = n.awaitStream ? ownedStream(runtime, source, epoch) : source;
    if (
      !n.awaitStream &&
      !Array.isArray(iterable) &&
      !(iterable instanceof Set) &&
      !(iterable instanceof DartTypedList)
    )
      throw Error('A collection loop requires an iterable.');
    const step = async (item) => {
      runtime.tick();
      const local = new Env({}, scope);
      bindPattern(runtime, n.pattern || { kind: 'binding', name: n.name }, item, local);
      const value = await evaluate(n.body, local);
      if (value instanceof Completion) return value;
      collect(value);
      return null;
    };
    if (n.awaitStream) {
      for await (const item of iterable) {
        const value = await step(item);
        if (value instanceof ReturnValue) return value;
        if (value instanceof LoopFlow && value.kind === 'break') break;
      }
    } else {
      for (const item of iterable) {
        const value = await step(item);
        if (value instanceof ReturnValue) return value;
        if (value instanceof LoopFlow && value.kind === 'break') break;
      }
    }
  } else {
    await evaluate(n.initialize);
    let first = true;
    while ((n.doFirst && first) || !n.condition || (await evaluate(n.condition))) {
      runtime.tick();
      first = false;
      const value = await evaluate(n.body);
      if (value instanceof ReturnValue) return value;
      if (value instanceof LoopFlow && value.kind === 'break') break;
      collect(value);
      scope = new Env({ ...scope.values }, env);
      for (const update of n.updates || []) await evaluate(update);
    }
  }
  return n.kind === 'forElement' ? result : null;
}
export function catchScope(runtime, clause, error, env) {
  if (
    clause.type &&
    !['Object', 'Exception', 'Error', 'dynamic'].includes(clause.type) &&
    !isDartType(runtime, error, clause.type)
  )
    return null;
  const scope = new Env({ $caught: error }, env);
  if (clause.exception) scope.values[clause.exception] = error;
  if (clause.stack) scope.values[clause.stack] = String(error?.stack || '');
  return scope;
}
