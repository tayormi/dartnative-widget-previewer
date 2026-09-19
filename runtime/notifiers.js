// A preview-owned notifier. It never reads browser storage or shares projects.
export class PreviewNotifier {
  constructor(value, type = null) {
    this.value = value;
    this.initial = value;
    this.type = type;
    this.listeners = new Set();
    this.disposed = false;
    this.check(value);
  }
  check(value) {
    const valid =
      this.type === 'bool'
        ? typeof value === 'boolean'
        : this.type === 'String'
          ? typeof value === 'string'
          : this.type === 'int'
            ? Number.isSafeInteger(value)
            : this.type === 'double'
              ? typeof value === 'number' && Number.isFinite(value)
              : true;
    if (!valid) throw Error(`ValueNotifier expects a ${this.type} value.`);
    if (this.disposed) throw Error('ValueNotifier was disposed.');
  }
  set(value) {
    this.check(value);
    if (value === this.value) return value;
    this.value = value;
    for (const listener of [...this.listeners]) if (this.listeners.has(listener)) listener();
    return value;
  }
  addListener(listener) {
    if (this.disposed || typeof listener !== 'function')
      throw Error('ValueNotifier needs an active listener.');
    this.listeners.add(listener);
  }
  removeListener(listener) {
    this.listeners.delete(listener);
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
}
