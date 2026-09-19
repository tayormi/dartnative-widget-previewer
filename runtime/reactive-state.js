// One graph per preview keeps dependencies and effects isolated across variants.
export class ReactiveGraph {
  constructor() {
    this.active = null;
    this.pending = new Set();
    this.resources = new Set();
    this.flushing = false;
  }
  read(value) {
    this.active?.add(value);
  }
  collect(fn) {
    const previous = this.active,
      deps = new Set();
    this.active = deps;
    try {
      return { value: fn(), deps };
    } finally {
      this.active = previous;
    }
  }
  notify(listeners) {
    for (const listener of listeners) this.pending.add(listener);
    if (this.flushing) return;
    this.flushing = true;
    let iterations = 0;
    try {
      while (this.pending.size) {
        if (++iterations > 1000) throw Error('Reactive update cycle exceeded the preview limit.');
        const next =
          [...this.pending].find((fn) => fn.derived) || this.pending.values().next().value;
        this.pending.delete(next);
        next();
      }
    } finally {
      this.pending.clear();
      this.flushing = false;
    }
  }
  effect(fn) {
    let deps = new Set(),
      stopped = false;
    const run = () => {
      if (stopped) return;
      const result = this.collect(fn);
      for (const dep of deps) dep.removeListener(run);
      deps = result.deps;
      for (const dep of deps) dep.addListener(run);
    };
    const stop = () => {
      stopped = true;
      for (const dep of deps) dep.removeListener(run);
      deps.clear();
      this.pending.delete(run);
      this.resources.delete(stop);
    };
    this.resources.add(stop);
    try {
      run();
    } catch (error) {
      stop();
      throw error;
    }
    return stop;
  }
  dispose() {
    for (const cleanup of [...this.resources]) cleanup();
    this.resources.clear();
    this.pending.clear();
  }
}
export class PreviewChangeNotifier {
  constructor(graph) {
    this.graph = graph;
    this.listeners = new Set();
    this.disposed = false;
    this.cleanup = () => this.dispose();
    graph.resources.add(this.cleanup);
  }
  addListener(fn) {
    if (this.disposed) throw Error('Listenable was disposed.');
    if (typeof fn !== 'function') throw Error('A listener must be a function.');
    this.listeners.add(fn);
  }
  removeListener(fn) {
    this.listeners.delete(fn);
  }
  notifyListeners() {
    if (this.disposed) throw Error('Listenable was disposed.');
    this.graph.notify([...this.listeners]);
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
    this.graph.resources.delete(this.cleanup);
  }
}
export class PreviewSignal extends PreviewChangeNotifier {
  constructor(graph, value, type = null) {
    super(graph);
    this.initial = value;
    this.type = type;
    this._value = value;
    this.check(value);
  }
  check(value) {
    const type = this.type?.replace(/\?$/, '');
    if (value === null && this.type?.endsWith('?')) return;
    const valid =
      type === 'int'
        ? Number.isSafeInteger(value)
        : type === 'num' || type === 'double'
          ? typeof value === 'number'
          : type === 'String'
            ? typeof value === 'string'
            : type === 'bool'
              ? typeof value === 'boolean'
              : true;
    if (!valid) throw Error(`Signal expects a ${this.type} value.`);
  }
  get value() {
    if (this.disposed) throw Error('Signal was disposed.');
    this.graph.read(this);
    return this._value;
  }
  set value(value) {
    this.set(value);
  }
  set(value) {
    if (this.disposed) throw Error('Signal was disposed.');
    this.check(value);
    if (value === this._value) return value;
    this._value = value;
    this.notifyListeners();
    return value;
  }
  update(fn) {
    return this.set(fn(this._value));
  }
  dispose() {
    super.dispose();
    this.graph.resources.delete(this.cleanup);
  }
}
export class PreviewComputed extends PreviewChangeNotifier {
  constructor(graph, compute) {
    super(graph);
    this.compute = compute;
    this.deps = new Set();
    this.initialized = false;
    this.evaluating = false;
    this.recompute = () => {
      if (this.disposed) return;
      if (this.evaluating) throw Error('Circular computed value.');
      this.evaluating = true;
      try {
        const { value, deps } = this.graph.collect(this.compute);
        for (const dep of this.deps) dep.removeListener(this.recompute);
        this.deps = deps;
        for (const dep of deps) dep.addListener(this.recompute);
        const changed = this.initialized && value !== this._value;
        this._value = value;
        this.initialized = true;
        if (changed) this.notifyListeners();
      } finally {
        this.evaluating = false;
      }
    };
    this.recompute.derived = true;
    try {
      this.recompute();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  get value() {
    if (this.disposed) throw Error('Computed was disposed.');
    this.graph.read(this);
    return this._value;
  }
  dispose() {
    for (const dep of this.deps) dep.removeListener(this.recompute);
    this.deps.clear();
    this.graph.pending.delete(this.recompute);
    this.graph.resources.delete(this.cleanup);
    super.dispose();
  }
}
export class PreviewTextController extends PreviewChangeNotifier {
  constructor(graph, text = '') {
    super(graph);
    this.controller = true;
    this._text = String(text);
    this.selection = {
      valueType: 'TextSelection',
      props: { baseOffset: -1, extentOffset: -1 },
      args: [],
    };
  }
  get text() {
    return this._text;
  }
  set text(value) {
    if (this.disposed) throw Error('Text controller was disposed.');
    const next = String(value);
    if (next === this._text) return;
    this._text = next;
    this.notifyListeners();
  }
  clear() {
    this.text = '';
  }
}
