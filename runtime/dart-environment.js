import { DartTypedList } from './typed-data.js';
// Environments expose only interpreted declarations, never JS prototypes.
export class Env {
  constructor(values = {}, parent = null) {
    this.values = values;
    this.parent = parent;
    this.getters = Object.create(null);
    this.setters = Object.create(null);
  }
  owns(name) {
    return (
      Object.hasOwn(this.values, name) ||
      Object.hasOwn(this.getters, name) ||
      Object.hasOwn(this.setters, name)
    );
  }
  get(name) {
    if (Object.hasOwn(this.getters, name)) return this.getters[name]();
    if (Object.hasOwn(this.values, name)) return this.values[name];
    if (this.parent) return this.parent.get(name);
    if (this.resolve) return this.resolve(name);
    throw Error(`Unresolved value: ${name}`);
  }
  set(name, value) {
    if (Object.hasOwn(this.setters, name)) {
      this.setters[name](value);
      return value;
    }
    if (Object.hasOwn(this.getters, name)) throw Error(`Cannot assign read-only getter ${name}.`);
    if (Object.hasOwn(this.values, name) || !this.parent) this.values[name] = value;
    else return this.parent.set(name, value);
    return value;
  }
}

export const dartInvocation = Symbol('Dart invocation');
export function invokeDart(fn, args = [], named = {}) {
  if (typeof fn !== 'function') throw Error('Unsupported callable.');
  return fn[dartInvocation] ? fn[dartInvocation](args, named) : fn(...args);
}
export function bindParameters(runtime, parameters, args, named, parent) {
  const scope = new Env({}, parent);
  let index = 0;
  for (const p of parameters) {
    const supplied = p.named ? Object.hasOwn(named, p.name) : index < args.length;
    if (!supplied && p.required && !p.super) throw Error(`Missing required argument: ${p.name}.`);
    scope.values[p.name] = supplied
      ? p.named
        ? named[p.name]
        : args[index++]
      : runtime.eval(p.default, parent);
  }
  return scope;
}

export class DartObject {
  constructor(name, scope) {
    this.name = name;
    this.scope = scope;
    this.fields = new Set();
  }
  get(name) {
    if (!this.scope.owns(name)) throw Error(`Unsupported property: ${this.name}.${name}`);
    return this.scope.get(name);
  }
  set(name, value) {
    if (!this.fields.has(name) && !Object.hasOwn(this.scope.setters, name))
      throw Error(`No writable field: ${this.name}.${name}`);
    return this.scope.set(name, value);
  }
}
export class DartSuper {
  constructor(object, base) {
    this.object = object;
    this.base = base;
  }
}
export const baseType = (name) => name?.replace(/<.*>/, '').replace(/\?$/, '');

export function isDartType(runtime, value, type) {
  if (value === null) return type.endsWith('?') || type === 'dynamic' || type === 'Null';
  const name = baseType(type);
  if (name === 'dynamic' || name === 'Object') return true;
  if (name === 'String') return typeof value === 'string';
  if (name === 'bool') return typeof value === 'boolean';
  if (name === 'int') return Number.isSafeInteger(value);
  if (name === 'double' || name === 'num') return typeof value === 'number';
  if (name === 'List' || name === 'Iterable')
    return (
      Array.isArray(value) ||
      value instanceof DartTypedList ||
      (name === 'Iterable' && value instanceof Set)
    );
  if (name === 'Map') return typeof value === 'object' && Object.getPrototypeOf(value) === null;
  if (name === 'Set') return value instanceof Set;
  if (value instanceof DartObject) {
    for (
      let current = value.name;
      current;
      current = baseType(runtime.model.classes[current]?.base)
    )
      if (current === name) return true;
  }
  if (value instanceof Error && value.dartTypes?.includes(name)) return true;
  return value?.enumType === name || value?.valueType === name;
}

export function classScope(runtime, name) {
  if (runtime.classScopes.has(name)) return runtime.classScopes.get(name);
  const cls = runtime.model.classes[name],
    scope = new Env({}, runtime.global);
  runtime.classScopes.set(name, scope);
  if (runtime.model.enums?.[name]) {
    const namespace = runtime.global.get(name);
    for (const value of namespace.values) scope.values[value.name] = value;
    scope.getters.values = () => [...namespace.values];
  }
  for (const [key, node] of Object.entries(cls.staticMethods || {}))
    scope.values[key] = runtime.eval(node, scope);
  for (const [key, node] of Object.entries(cls.staticGetters || {}))
    scope.getters[key] = runtime.eval(node, scope);
  for (const [key, node] of Object.entries(cls.staticSetters || {}))
    scope.setters[key] = runtime.eval(node, scope);
  for (const [key, node] of Object.entries(cls.staticFields || {}))
    if (node === null) scope.values[key] = null;
    else installLazy(runtime, scope, key, node);
  return scope;
}
function installLazy(runtime, scope, key, node) {
  let evaluating = false;
  scope.getters[key] = () => {
    if (evaluating) throw Error(`Circular initialization: ${key}.`);
    if (node === null) throw Error(`Late field ${key} has not been initialized.`);
    evaluating = true;
    try {
      const value = runtime.eval(node, scope);
      delete scope.getters[key];
      delete scope.setters[key];
      scope.values[key] = value;
      return value;
    } finally {
      evaluating = false;
    }
  };
  scope.setters[key] = (value) => {
    delete scope.getters[key];
    delete scope.setters[key];
    scope.values[key] = value;
  };
}

export function createDartObject(runtime, name, args, props, constructor = '') {
  const scope = new Env({}, classScope(runtime, name)),
    object = new DartObject(name, scope);
  scope.values.this = object;
  const chain = [];
  for (
    let current = name;
    Object.hasOwn(runtime.model.classes, current);
    current = baseType(runtime.model.classes[current].base)
  ) {
    if (chain.includes(current)) throw Error('Circular class inheritance.');
    chain.unshift(current);
  }
  for (const current of chain) {
    const cls = runtime.model.classes[current];
    for (const [key, node] of Object.entries(cls.methods))
      scope.values[key] = runtime.eval(node, scope);
    for (const [key, node] of Object.entries(cls.getters || {}))
      scope.getters[key] = runtime.eval(node, scope);
    for (const [key, node] of Object.entries(cls.setters || {}))
      scope.setters[key] = runtime.eval(node, scope);
    for (const key of Object.keys(cls.fields)) object.fields.add(key);
  }
  scope.values.super = new DartSuper(object, baseType(runtime.model.classes[name].base));
  if (chain.some((n) => baseType(runtime.model.classes[n].base) === 'ChangeNotifier'))
    runtime.attachNotifier(object);
  function initialize(current, ctorName, positionals, named) {
    const cls = runtime.model.classes[current],
      ctor = cls.constructors?.[ctorName];
    if (!ctor && ctorName) throw Error(`Unknown constructor ${current}.${ctorName}.`);
    const parameters = ctor?.parameters || [];
    const locals = bindParameters(runtime, parameters, positionals, named, scope);
    const redirect = ctor?.initializers.find((i) => i.kind === 'redirectConstructor');
    if (redirect)
      return initialize(
        current,
        redirect.name,
        redirect.args.map((n) => runtime.eval(n, locals)),
        Object.fromEntries(
          Object.entries(redirect.named).map(([k, n]) => [k, runtime.eval(n, locals)]),
        ),
      );
    const parent = baseType(cls.base),
      superCall = ctor?.initializers.find((i) => i.kind === 'superConstructor');
    if (Object.hasOwn(runtime.model.classes, parent)) {
      const forwarded = parameters.filter((p) => p.super);
      const superArgs = superCall
        ? superCall.args.map((n) => runtime.eval(n, locals))
        : forwarded.filter((p) => !p.named).map((p) => locals.get(p.name));
      const superNamed = superCall
        ? Object.fromEntries(
            Object.entries(superCall.named).map(([k, n]) => [k, runtime.eval(n, locals)]),
          )
        : Object.fromEntries(
            forwarded.filter((p) => p.named).map((p) => [p.name, locals.get(p.name)]),
          );
      initialize(parent, superCall?.name || '', superArgs, superNamed);
    }
    for (const [key, node] of Object.entries(cls.fields)) {
      if (cls.lateFields?.includes(key)) installLazy(runtime, scope, key, node);
      else scope.values[key] = runtime.eval(node, scope);
    }
    for (const p of parameters) if (p.field) scope.values[p.name] = locals.get(p.name);
    if (!Object.hasOwn(runtime.model.classes, parent))
      for (const p of parameters)
        if (p.super) {
          scope.values[p.name] = locals.get(p.name);
          object.fields.add(p.name);
        }
    // Constructors emitted by older parser builds only supplied named defaults.
    if (!ctor)
      Object.assign(
        scope.values,
        Object.fromEntries(
          Object.entries(cls.defaults || {}).map(([k, n]) => [k, runtime.eval(n, scope)]),
        ),
        named,
      );
    for (const init of ctor?.initializers || []) {
      if (init.kind === 'field') scope.values[init.name] = runtime.eval(init.value, locals);
      else if (!['superConstructor', 'redirectConstructor'].includes(init.kind))
        runtime.eval(init, locals);
    }
    if (ctor?.body) {
      const result = runtime.run(ctor.body, locals);
      if (ctor.factory) return result;
    }
  }
  return initialize(name, constructor, args, props) || object;
}
