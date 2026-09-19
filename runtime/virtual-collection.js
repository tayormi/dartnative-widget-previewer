import { VirtualLayout } from './virtual-layout.js';
import { insetValues } from './layout-values.js';
export const virtualWidgets = new Set([
  'FastList',
  'ListView.builder',
  'FastGrid',
  'MasonryFastGrid',
  'GridView.builder',
]);
export class VirtualCollection {
  constructor(runtime, key, node, context, parent) {
    this.runtime = runtime;
    this.key = key;
    this.node = node;
    this.context = context;
    this.parent = parent;
    this.route = runtime.currentRoute;
    this.layout = new VirtualLayout();
    this.cache = new Map();
    this.offset = 0;
    this.initialPlacement = true;
    this.viewport = 650;
    this.cross = 402;
    this.range = [0, 0];
    this.mountedIndices = new Set();
    this.cleanup = null;
    this.disposed = false;
  }
  configure(value) {
    const p = value.props,
      kind =
        value.widget === 'MasonryFastGrid'
          ? 'masonry'
          : ['FastGrid', 'GridView.builder'].includes(value.widget)
            ? 'grid'
            : 'list',
      grid = p.gridDelegate?.props || p;
    const followInsert =
      value.widget === 'FastList' &&
      p.reverse &&
      this.settings &&
      p.itemCount > this.settings.count &&
      Math.abs(this.offset - this.maxScroll) < 1;
    this.keep = p.keepAliveCount ?? (value.widget.startsWith('Fast') ? 30 : 8);
    if (!Number.isInteger(this.keep) || this.keep < 0 || this.keep > 1000)
      throw Error('Preview keepAliveCount must be between 0 and 1000.');
    if (this.builder && this.builder !== p.itemBuilder && !p.stableItems) this.cache.clear();
    this.builder = p.itemBuilder;
    this.retainState =
      ['FastList', 'FastGrid', 'MasonryFastGrid'].includes(value.widget) &&
      p.keepAliveCount == null;
    this.props = p;
    this.kind = kind;
    this.horizontal = p.scrollDirection?.symbol === 'Axis.horizontal';
    const padding = insetValues(p.padding);
    this.paddingStart = padding[this.horizontal ? 3 : 0];
    this.paddingEnd = padding[this.horizontal ? 1 : 2];
    this.anchorEnd ??= !!p.reverse;
    this.transientEndAnchor = value.widget === 'FastList';
    // Native reverse lists follow inserts only while already at the end.
    // A row resize instead preserves the first visible row.
    if (followInsert) this.anchorEnd = true;
    this.settings = {
      count: p.itemCount,
      kind,
      reverse: !!p.reverse,
      columns: grid.crossAxisCount ?? 1,
      gap: grid.mainAxisSpacing ?? 0,
      crossGap: grid.crossAxisSpacing ?? 0,
      ratio: grid.childAspectRatio ?? 1,
      extent: kind === 'list' ? p.itemExtent : grid.mainAxisExtent,
      heightBuilder: p.itemHeightBuilder,
    };
    this.layout.configure({ ...this.settings, cross: this.cross });
    this.full = !!p.shrinkWrap || p.physics?.valueType === 'NeverScrollableScrollPhysics';
    if (this.anchorEnd) this.offset = this.maxScroll;
    this.refreshRange();
  }
  get maxScroll() {
    return Math.max(0, this.layout.total + this.paddingStart + this.paddingEnd - this.viewport);
  }
  visibleRange(keep = this.keep) {
    return this.layout.range(Math.max(0, this.offset - this.paddingStart), this.viewport, keep);
  }
  refreshRange() {
    this.range = this.full ? [0, this.layout.count] : this.visibleRange();
  }
  build() {
    const [start, end] = this.range,
      children = [],
      indices = [];
    for (const key of this.cache.keys()) if (key < start || key >= end) this.cache.delete(key);
    for (let index = start; index < end; index++) {
      this.runtime.tick();
      const previous = this.runtime.parentInstance;
      this.runtime.parentInstance = `${this.key}/item:${index}`;
      try {
        const child = this.runtime.withContext(this.context, () =>
          this.runtime.refreshTree(
            this.cache.has(index) ? this.cache.get(index) : this.builder(this.context, index),
          ),
        );
        this.cache.set(index, child);
        children.push(child);
        indices.push(index);
      } finally {
        this.runtime.parentInstance = previous;
      }
    }
    this.mountedIndices = new Set(indices);
    return { children, indices };
  }
  update(offset, viewport, cross) {
    if (this.disposed || viewport <= 0 || cross <= 0) return;
    this.runtime.steps = 0;
    const oldTotal = this.layout.total,
      oldRange = this.range.join(':'),
      oldCross = this.cross;
    this.offset = Math.max(0, offset);
    this.viewport = viewport;
    this.cross = Math.round(cross * 100) / 100;
    this.layout.configure({ ...this.settings, cross: this.cross });
    if (this.anchorEnd) this.offset = this.maxScroll;
    this.refreshRange();
    if (
      oldRange !== this.range.join(':') ||
      oldTotal !== this.layout.total ||
      oldCross !== this.cross
    )
      this.runtime.scheduleChange();
  }
  measure(entries) {
    if (this.kind !== 'list' || this.settings.extent || this.disposed) return;
    const mainOffset = Math.max(0, this.offset - this.paddingStart);
    const anchor = this.layout.list.at(
        this.settings.reverse ? Math.max(0, this.layout.total - mainOffset - 0.001) : mainOffset,
      ),
      before = this.layout.geometry(anchor).main;
    let changed = false;
    for (const [index, size] of entries) {
      if (index === 0 && this.layout.list.measured.size === 0) {
        const old = this.layout.list.estimate;
        this.layout.list.estimateFromFirst(size);
        changed ||= old !== this.layout.list.estimate;
      }
      changed = this.layout.list.measure(index, size) || changed;
    }
    if (changed) {
      this.layoutRevision = (this.layoutRevision ?? 0) + 1;
      this.offset = this.anchorEnd
        ? this.maxScroll
        : Math.max(0, this.offset + this.layout.geometry(anchor).main - before);
      this.refreshRange();
      this.runtime.scheduleChange();
    }
    if (!changed && this.transientEndAnchor && this.anchorEnd && !this.endAnchorReleaseQueued) {
      this.endAnchorReleaseQueued = true;
      // Release after stable geometry reaches both the viewport and adapter.
      // Later size changes must not keep a previous bottom command armed.
      queueMicrotask(() => {
        this.endAnchorReleaseQueued = false;
        if (!this.disposed) this.anchorEnd = false;
      });
    }
  }
  prepare(index) {
    this.anchorEnd = false;
    if (index >= this.layout.count) throw Error('Scroll item index is outside the collection.');
    if (this.mountedIndices.has(index)) return true;
    this.offset = this.layout.geometry(index).main + this.paddingStart;
    this.refreshRange();
    this.runtime.scheduleChange();
    return false;
  }
  dispose() {
    this.disposed = true;
    this.cleanup?.();
    this.cleanup = null;
    this.cache.clear();
  }
}
