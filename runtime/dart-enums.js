import { invokeDart, classScope } from './dart-environment.js';
export class DartEnumValue {
  #runtime;
  #object;
  #initializing = false;
  constructor(runtime, type, name, index, constant) {
    this.#runtime = runtime;
    this.enumType = type;
    this.name = name;
    this.index = index;
    this.symbol = `${type}.${name}`;
    this.constant = constant;
  }
  object() {
    if (this.#object) return this.#object;
    if (this.#initializing) throw Error(`Circular enum initialization: ${this.symbol}`);
    this.#initializing = true;
    try {
      const runtime = this.#runtime,
        args = (this.constant.args ?? []).map((n) => runtime.eval(n, runtime.global)),
        props = Object.fromEntries(
          Object.entries(this.constant.named ?? {}).map(([key, n]) => [
            key,
            runtime.eval(n, runtime.global),
          ]),
        );
      const object = runtime.instantiate(
        this.enumType,
        args,
        props,
        null,
        runtime.global,
        this.constant.constructor ?? '',
      );
      object.scope.values.name = this.name;
      object.scope.values.index = this.index;
      object.scope.values.this = this;
      this.#object = object;
      return object;
    } finally {
      this.#initializing = false;
    }
  }
  read(name) {
    if (name === 'name' || name === 'index') return this[name];
    return this.#runtime.get(this.object(), name);
  }
  invoke(name, args, props) {
    if (
      name === 'toString' &&
      !Object.hasOwn(this.#runtime.model.classes[this.enumType]?.methods ?? {}, 'toString')
    )
      return this.symbol;
    return invokeDart(this.read(name), args, props);
  }
}
export function enumMember(runtime, namespace, name) {
  if (name === 'values') return [...namespace.values];
  const entry = namespace.values.find((value) => value.name === name);
  if (entry) return entry;
  if (runtime.model.classes[namespace.enumNamespace]) {
    const scope = classScope(runtime, namespace.enumNamespace);
    if (scope.owns(name)) return scope.get(name);
  }
  throw Error(`Unknown enum member ${name}.`);
}
