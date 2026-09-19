import { DartTypedList, DartByteData } from './typed-data.js';

// Lower a restricted, finite typed-data loop to composed closures. This never
// evaluates JavaScript source and never invokes user getters or callbacks.
// Ineligible loops retain the normal interpreter and its instruction limit.
const unsupported = Symbol('not a numeric loop');
const fail = () => {
  throw unsupported;
};
function stored(env, name) {
  for (let scope = env; scope; scope = scope.parent) {
    if (Object.hasOwn(scope.getters, name) || Object.hasOwn(scope.setters, name)) fail();
    if (Object.hasOwn(scope.values, name)) return scope.values[name];
  }
  fail();
}
const round = (value) => {
  if (!Number.isFinite(value)) throw Error('Cannot convert a non-finite number to an integer.');
  return Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
};
const binary = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '>=': (a, b) => a >= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
};

function plan(n, env) {
  if (
    n.kind !== 'loop' ||
    n.awaitStream ||
    n.items ||
    n.doFirst ||
    n.initialize?.kind !== 'variables' ||
    n.initialize.entries.length !== 1
  )
    fail();
  const initial = n.initialize.entries[0],
    index = initial.name;
  if (
    initial.value?.kind !== 'literal' ||
    !Number.isSafeInteger(initial.value.value) ||
    initial.value.value < 0
  )
    fail();
  const c = n.condition,
    update = n.updates?.[0];
  if (
    c?.kind !== 'binary' ||
    c.op !== '<' ||
    c.left?.kind !== 'ref' ||
    c.left.name !== index ||
    c.right?.kind !== 'get' ||
    c.right.name !== 'length' ||
    c.right.target?.kind !== 'ref'
  )
    fail();
  if (
    n.updates.length !== 1 ||
    !['postfix', 'prefix'].includes(update.kind) ||
    update.op !== '++' ||
    update.value?.name !== index
  )
    fail();
  const input = stored(env, c.right.target.name);
  if (!(input instanceof DartTypedList)) fail();
  const locals = new Map([[index, 0]]),
    slots = [initial.value.value];
  const expr = (node) => {
    if (node.kind === 'literal' && ['number', 'boolean'].includes(typeof node.value))
      return () => node.value;
    if (node.kind === 'ref') {
      if (locals.has(node.name)) {
        const slot = locals.get(node.name);
        return () => slots[slot];
      }
      const value = stored(env, node.name);
      if (typeof value !== 'number' && typeof value !== 'boolean') fail();
      return () => value;
    }
    if (
      node.kind === 'get' &&
      node.target?.name === 'Endian' &&
      ['little', 'big'].includes(node.name)
    ) {
      if (locals.has('Endian') || stored(env, 'Endian')?.symbol !== 'Endian') fail();
      const value = { symbol: `Endian.${node.name}` };
      return () => value;
    }
    if (node.kind === 'index' && node.target?.kind === 'ref') {
      if (locals.has(node.target.name)) fail();
      const array = stored(env, node.target.name);
      if (!(array instanceof DartTypedList)) fail();
      const at = expr(node.index);
      return () => array.at(at());
    }
    if (node.kind === 'prefix' && ['-', '!'].includes(node.op)) {
      const value = expr(node.value);
      return node.op === '-' ? () => -value() : () => !value();
    }
    if (node.kind === 'binary' && Object.hasOwn(binary, node.op)) {
      const a = expr(node.left),
        b = expr(node.right),
        op = binary[node.op];
      return () => op(a(), b());
    }
    if (node.kind === 'conditional') {
      const c = expr(node.condition),
        a = expr(node.yes),
        b = expr(node.no);
      return () => (c() ? a() : b());
    }
    if (
      node.kind === 'call' &&
      !node.args.length &&
      !Object.keys(node.named).length &&
      ['round', 'abs', 'floor', 'ceil'].includes(node.name)
    ) {
      const target = expr(node.target),
        fn = node.name === 'round' ? round : Math[node.name];
      return () => {
        const value = target();
        if (typeof value !== 'number') throw Error('Numeric methods need a number.');
        return fn(value);
      };
    }
    fail();
  };
  const statement = (node) => {
    if (node.kind === 'variables') {
      const writes = node.entries.map((entry) => {
        if (locals.has(entry.name)) fail();
        const value = expr(entry.value),
          slot = slots.length;
        slots.push(null);
        locals.set(entry.name, slot);
        return () => {
          slots[slot] = value();
        };
      });
      return () => {
        for (const write of writes) write();
      };
    }
    if (
      node.kind === 'call' &&
      node.target?.kind === 'ref' &&
      !Object.keys(node.named).length &&
      /^set(Int16|Uint16|Int32|Uint32|Float32|Float64|Int8|Uint8)$/.test(node.name)
    ) {
      if (locals.has(node.target.name)) fail();
      const target = stored(env, node.target.name);
      if (!(target instanceof DartByteData) || node.args.length < 2 || node.args.length > 3) fail();
      const args = node.args.map(expr);
      return () =>
        target.invoke(
          node.name,
          args.map((arg) => arg()),
        );
    }
    if (
      node.kind === 'assign' &&
      node.op === '=' &&
      node.left?.kind === 'index' &&
      node.left.target?.kind === 'ref'
    ) {
      if (locals.has(node.left.target.name)) fail();
      const target = stored(env, node.left.target.name);
      if (!(target instanceof DartTypedList)) fail();
      const at = expr(node.left.index),
        value = expr(node.right);
      return () => target.set(at(), value());
    }
    fail();
  };
  const statements = n.body.kind === 'block' ? n.body.statements : [n.body],
    body = statements.map(statement);
  return { slots, input, body };
}

export function runNumericLoop(runtime, n, env) {
  let compiled;
  try {
    compiled = plan(n, env);
  } catch (error) {
    if (error === unsupported) return false;
    throw error;
  }
  const { slots, input, body } = compiled;
  if (input.length - slots[0] > 1_000_000)
    throw Error('A preview numeric loop cannot exceed one million samples.');
  runtime.numericDeadline ??= performance.now() + 250;
  for (; slots[0] < input.length; slots[0]++) {
    if ((slots[0] & 1023) === 0 && performance.now() > runtime.numericDeadline)
      throw Error('Preview numeric work exceeded its 250 ms execution budget.');
    for (const statement of body) statement();
  }
  return true;
}
