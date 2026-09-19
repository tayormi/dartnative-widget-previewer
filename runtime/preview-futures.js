import { unwrapFuture } from './dart-future.js';
// A Future belongs to a mounted builder. Rebuilds keep its subscription, while
// replacements, popped routes and reset invalidate late completions.
const snapshot = (state, data = null, error = null, stackTrace = null) => ({
  connectionState: { symbol: `ConnectionState.${state}` },
  data,
  error,
  stackTrace,
  hasData: data != null,
  hasError: error != null,
});
export class PreviewFutures {
  constructor(runtime) {
    this.runtime = runtime;
    this.records = new Map();
    this.seen = new Set();
  }
  beginFrame() {
    this.seen.clear();
  }
  build(tree, context, parent) {
    const { runtime } = this,
      key = tree.futureKey,
      props = { ...tree.props, future: unwrapFuture(tree.props.future) };
    if (typeof props.builder !== 'function') throw Error('FutureBuilder needs a builder.');
    if (props.future != null && !(props.future instanceof Promise))
      throw Error('FutureBuilder.future needs a Future.');
    this.seen.add(key);
    let record = this.records.get(key);
    if (!record) {
      record = {
        route: runtime.currentRoute,
        future: undefined,
        snapshot: snapshot('none', props.initialData),
        version: 0,
      };
      this.records.set(key, record);
    }
    if (record.future !== props.future) {
      record.future = props.future;
      const version = ++record.version,
        epoch = runtime.epoch;
      record.snapshot = snapshot(props.future == null ? 'none' : 'waiting', record.snapshot.data);
      const settle = (data, error) => {
        if (
          runtime.disposed ||
          runtime.epoch !== epoch ||
          record.version !== version ||
          this.records.get(key) !== record
        )
          return;
        record.snapshot = snapshot('done', data, error, error?.stack ?? null);
        runtime.scheduleChange();
      };
      props.future?.then(
        (data) => settle(data, null),
        (error) => settle(null, error),
      );
    }
    const previous = runtime.parentInstance;
    runtime.parentInstance = parent;
    try {
      return {
        ...tree,
        props: {
          ...props,
          child: runtime.withContext(context, () =>
            runtime.refreshTree(props.builder(context, record.snapshot)),
          ),
        },
      };
    } finally {
      runtime.parentInstance = previous;
    }
  }
  finishFrame() {
    const r = this.runtime;
    for (const [key, record] of this.records) {
      const popped = record.route != null && !r.stack.includes(record.route);
      const unmounted =
        !r.overlays.length && record.route === r.currentRoute && !this.seen.has(key);
      if (popped || unmounted) this.records.delete(key);
    }
  }
  dispose() {
    this.records.clear();
    this.seen.clear();
  }
}
