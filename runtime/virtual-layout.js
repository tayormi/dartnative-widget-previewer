// Layout metadata is small and independent of mounted Dart widgets. A Fenwick
// tree lets variable-height lists measure and seek without walking every row.
export class ListGeometry {
  constructor(count = 0, extent = 56) {
    this.count = count;
    this.estimate = extent;
    this.measured = new Map();
    this.rebuild();
  }
  rebuild() {
    this.sums = new Float64Array(this.count + 1);
    for (const [index, size] of this.measured)
      if (index < this.count) this.add(index, size - this.estimate);
  }
  add(index, delta) {
    for (let i = index + 1; i <= this.count; i += i & -i) this.sums[i] += delta;
  }
  resize(count) {
    if (count === this.count) return;
    this.count = count;
    for (const key of this.measured.keys()) if (key >= count) this.measured.delete(key);
    this.rebuild();
  }
  prefix(index) {
    let sum = Math.min(this.count, index) * this.estimate;
    for (let i = Math.min(this.count, index); i > 0; i -= i & -i) sum += this.sums[i];
    return sum;
  }
  get total() {
    return this.prefix(this.count);
  }
  size(index) {
    return this.measured.get(index) ?? this.estimate;
  }
  measure(index, size) {
    if (index < 0 || index >= this.count || !Number.isFinite(size) || size <= 0) return false;
    size = Math.round(size * 100) / 100;
    const old = this.size(index);
    if (Math.abs(old - size) < 0.1) return false;
    this.measured.set(index, size);
    this.add(index, size - old);
    return true;
  }
  estimateFromFirst(size) {
    if (
      !Number.isFinite(size) ||
      size <= 0 ||
      this.measured.size ||
      Math.abs(size - this.estimate) < 0.1
    )
      return;
    this.estimate = Math.round(size * 100) / 100;
    this.rebuild();
  }
  at(offset) {
    let low = 0,
      high = this.count;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.prefix(mid + 1) <= offset) low = mid + 1;
      else high = mid;
    }
    return Math.min(Math.max(0, this.count - 1), low);
  }
}
export class VirtualLayout {
  constructor() {
    this.list = new ListGeometry();
    this.count = 0;
    this.cross = 402;
    this.kind = 'list';
    this.reverse = false;
    this.columns = 1;
    this.gap = 0;
    this.crossGap = 0;
    this.ratio = 1;
    this.positions = [];
  }
  configure({
    count,
    kind = 'list',
    reverse = false,
    cross = 402,
    columns = 1,
    gap = 0,
    crossGap = 0,
    ratio = 1,
    extent,
    heightBuilder,
  }) {
    if (!Number.isInteger(count) || count < 0 || count > 100000)
      throw Error('Preview collections support itemCount from 0 to 100,000.');
    if (!Number.isInteger(columns) || columns < 1 || columns > 100)
      throw Error('Grid crossAxisCount must be between 1 and 100.');
    if (
      !Number.isFinite(cross) ||
      cross <= 0 ||
      !Number.isFinite(ratio) ||
      ratio <= 0 ||
      gap < 0 ||
      crossGap < 0
    )
      throw Error('Invalid virtual grid dimensions.');
    if (extent != null && (!Number.isFinite(extent) || extent <= 0))
      throw Error('Item extent must be positive.');
    const changed =
      this.count !== count ||
      this.kind !== kind ||
      this.cross !== cross ||
      this.columns !== columns ||
      this.gap !== gap ||
      this.crossGap !== crossGap ||
      this.ratio !== ratio ||
      this.extent !== extent ||
      this.heightBuilder !== heightBuilder;
    Object.assign(this, {
      count,
      kind,
      reverse,
      cross,
      columns,
      gap,
      crossGap,
      ratio,
      extent,
      heightBuilder,
    });
    this.list.resize(count);
    this.cellCross = Math.max(1, (cross - (columns - 1) * crossGap) / columns);
    if (kind === 'masonry' && changed) {
      if (typeof heightBuilder !== 'function')
        throw Error('MasonryFastGrid needs itemHeightBuilder.');
      const heights = Array(columns).fill(0);
      this.positions = [];
      for (let index = 0; index < count; index++) {
        const size = heightBuilder(index);
        if (!Number.isFinite(size) || size <= 0)
          throw Error('Masonry item heights must be positive.');
        let column = 0;
        for (let c = 1; c < columns; c++) if (heights[c] < heights[column]) column = c;
        this.positions.push({
          main: heights[column],
          cross: column * (this.cellCross + crossGap),
          size,
          crossSize: this.cellCross,
        });
        heights[column] += size + gap;
      }
      this.masonryExtent = Math.max(0, ...heights) - (count ? gap : 0);
    }
  }
  get total() {
    if (this.kind === 'list') return this.extent ? this.count * this.extent : this.list.total;
    if (this.kind === 'masonry') return this.masonryExtent;
    const rows = Math.ceil(this.count / this.columns);
    return rows * (this.extent ?? this.cellCross / this.ratio) + Math.max(0, rows - 1) * this.gap;
  }
  geometry(index) {
    let result;
    if (this.kind === 'list')
      result = {
        main: this.extent ? index * this.extent : this.list.prefix(index),
        cross: 0,
        size: this.extent ?? this.list.size(index),
        crossSize: this.cross,
      };
    else if (this.kind === 'masonry') result = { ...this.positions[index] };
    else {
      const size = this.extent ?? this.cellCross / this.ratio;
      result = {
        main: Math.floor(index / this.columns) * (size + this.gap),
        cross: (index % this.columns) * (this.cellCross + this.crossGap),
        size,
        crossSize: this.cellCross,
      };
    }
    if (this.reverse) result.main = this.total - result.main - result.size;
    return result;
  }
  range(offset, viewport, keep = 8) {
    if (!this.count) return [0, 0];
    offset = Math.max(0, offset);
    viewport = Math.max(1, viewport);
    if (this.reverse) offset = Math.max(0, this.total - offset - viewport);
    let first, last;
    if (this.kind === 'list') {
      first = this.extent ? Math.floor(offset / this.extent) : this.list.at(offset);
      last = this.extent
        ? Math.floor((offset + viewport) / this.extent)
        : this.list.at(offset + viewport);
    } else if (this.kind === 'grid') {
      const stride = (this.extent ?? this.cellCross / this.ratio) + this.gap;
      first = Math.floor(offset / stride) * this.columns;
      last = (Math.floor((offset + viewport) / stride) + 1) * this.columns - 1;
    } else {
      first = this.count - 1;
      last = 0;
      for (let i = 0; i < this.count; i++) {
        const box = this.positions[i];
        if (box.main + box.size >= offset && box.main <= offset + viewport) {
          first = Math.min(first, i);
          last = Math.max(last, i);
        }
      }
    }
    return [
      Math.max(0, Math.min(this.count - 1, first) - keep),
      Math.min(this.count, last + 1 + keep),
    ];
  }
}
