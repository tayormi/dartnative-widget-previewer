// List.asMap is a live, read-only view, not a copied JavaScript object.
export class DartListMap {
  constructor(list) {
    this.list = list;
  }
  containsKey(key) {
    return Number.isInteger(key) && key >= 0 && key < this.list.length;
  }
  at(key) {
    return this.containsKey(key) ? this.list[key] : null;
  }
  read(name) {
    if (name === 'entries') return this.list.map((value, key) => ({ key, value }));
    if (name === 'keys') return this.list.map((_, key) => key);
    if (name === 'values') return [...this.list];
    if (name === 'length') return this.list.length;
    if (name === 'isEmpty') return this.list.length === 0;
    if (name === 'isNotEmpty') return this.list.length > 0;
    throw Error(`Unsupported map property: ${name}`);
  }
  invoke(name, args) {
    if (name === 'containsKey') return this.containsKey(args[0]);
    if (name === 'containsValue') return this.list.includes(args[0]);
    if (name === 'forEach') {
      this.list.forEach((value, key) => args[0](key, value));
      return null;
    }
    throw Error(`List.asMap is read-only; unsupported method: ${name}`);
  }
}
