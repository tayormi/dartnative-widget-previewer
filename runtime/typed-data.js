// Only Dart's typed-data API crosses this boundary; JavaScript buffers and
// prototypes are never exposed to interpreted source.
const types = { Uint8List: Uint8Array, Int16List: Int16Array, Float32List: Float32Array };
const maxBytes = 64 * 1024 * 1024;
const integer = (n, max = maxBytes) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > max)
    throw Error('Typed-data range is outside the buffer.');
  return n;
};
export class DartByteBuffer {
  #buffer;
  constructor(buffer) {
    this.#buffer = buffer;
    this.valueType = 'ByteBuffer';
  }
  view(Type, offset = 0, length) {
    integer(offset, this.#buffer.byteLength);
    const bytes = Type === DataView ? 1 : Type.BYTES_PER_ELEMENT;
    length ??= (this.#buffer.byteLength - offset) / bytes;
    integer(length);
    if (offset % bytes || offset + length * bytes > this.#buffer.byteLength)
      throw Error('Typed-data view is outside or misaligned with the buffer.');
    return new Type(this.#buffer, offset, length);
  }
  read(name) {
    if (name === 'lengthInBytes') return this.#buffer.byteLength;
    throw Error(`Unsupported ByteBuffer property: ${name}`);
  }
  invoke(name, args) {
    if (name === 'asByteData') return new DartByteData(this.view(DataView, ...args));
    const type = Object.keys(types).find((t) => name === `as${t}`);
    if (type) return new DartTypedList(type, this.view(types[type], ...args));
    throw Error(`Unsupported ByteBuffer method: ${name}`);
  }
}
export class DartTypedList {
  #data;
  constructor(type, data) {
    this.valueType = type;
    this.#data = data;
  }
  get length() {
    return this.#data.length;
  }
  *[Symbol.iterator]() {
    yield* this.#data;
  }
  at(index) {
    return this.#data[integer(index, this.length - 1)];
  }
  set(index, value) {
    integer(index, this.length - 1);
    if (typeof value !== 'number' || (this.valueType !== 'Float32List' && !Number.isInteger(value)))
      throw Error('Typed lists need numeric values of the correct type.');
    this.#data[index] = value;
    return value;
  }
  read(name) {
    if (name === 'buffer') return new DartByteBuffer(this.#data.buffer);
    if (name === 'length') return this.length;
    if (name === 'lengthInBytes') return this.#data.byteLength;
    if (name === 'offsetInBytes') return this.#data.byteOffset;
    if (name === 'elementSizeInBytes') return this.#data.BYTES_PER_ELEMENT;
    if (name === 'isEmpty') return !this.length;
    if (name === 'isNotEmpty') return !!this.length;
    if (name === 'first') return this.at(0);
    if (name === 'last') return this.at(this.length - 1);
    throw Error(`Unsupported ${this.valueType} property: ${name}`);
  }
  invoke(name, args) {
    if (name === 'toList') return [...this];
    if (name === 'sublist') {
      const a = integer(args[0], this.length),
        b = integer(args[1] ?? this.length, this.length);
      if (b < a) throw Error('Invalid typed-list range.');
      return new DartTypedList(this.valueType, this.#data.slice(a, b));
    }
    throw Error(`Unsupported ${this.valueType} method: ${name}`);
  }
  bytes() {
    return new Uint8Array(this.#data.buffer, this.#data.byteOffset, this.#data.byteLength);
  }
  copyTo(array, offset = 0) {
    array.set(this.#data, offset);
  }
}
export class DartByteData {
  #view;
  constructor(view) {
    this.#view = view;
    this.valueType = 'ByteData';
  }
  read(name) {
    if (name === 'buffer') return new DartByteBuffer(this.#view.buffer);
    if (name === 'lengthInBytes') return this.#view.byteLength;
    if (name === 'offsetInBytes') return this.#view.byteOffset;
    throw Error(`Unsupported ByteData property: ${name}`);
  }
  invoke(name, args) {
    const match = /^(get|set)(Int16|Uint16|Int32|Uint32|Float32|Float64|Int8|Uint8)$/.exec(name);
    if (!match) throw Error(`Unsupported ByteData method: ${name}`);
    const size = {
        Int8: 1,
        Uint8: 1,
        Int16: 2,
        Uint16: 2,
        Int32: 4,
        Uint32: 4,
        Float32: 4,
        Float64: 8,
      }[match[2]],
      write = match[1] === 'set',
      offset = integer(args[0], this.#view.byteLength - size),
      endian = args[write ? 2 : 1]?.symbol ?? 'Endian.big';
    if (!['Endian.big', 'Endian.little'].includes(endian)) throw Error('Unknown byte order.');
    if (write) {
      if (typeof args[1] !== 'number') throw Error('ByteData needs a numeric value.');
      this.#view[name](offset, args[1], endian === 'Endian.little');
      return null;
    }
    return this.#view[name](offset, endian === 'Endian.little');
  }
}
export const typedDataCalls = new Set([
  'ByteData',
  'ByteData.view',
  ...Object.keys(types).flatMap((type) => [type, `${type}.fromList`, `${type}.view`]),
]);
export class TypedDataMemory {
  constructor() {
    this.allocated = 0;
  }
  allocate(bytes) {
    integer(bytes);
    if (this.allocated + bytes > maxBytes)
      throw Error(
        'Preview typed-data allocation limit reached (64 MB). Reset the preview to release its buffers.',
      );
    this.allocated += bytes;
  }
  invoke(name, args, props = {}) {
    if (Object.keys(props).length)
      throw Error('Typed-data constructors take positional arguments.');
    const [type, ctor] = name.split('.'),
      Type = type === 'ByteData' ? DataView : types[type];
    if (ctor === 'view' ? args.length < 1 || args.length > 3 : args.length !== 1)
      throw Error('Invalid typed-data constructor arguments.');
    let data;
    if (ctor === 'view') {
      if (!(args[0] instanceof DartByteBuffer))
        throw Error('A typed-data view needs a ByteBuffer.');
      data = args[0].view(Type, args[1], args[2]);
    } else if (ctor === 'fromList') {
      if (!Array.isArray(args[0]) && !(args[0] instanceof DartTypedList))
        throw Error('fromList needs a numeric list.');
      if (
        [...args[0]].some(
          (v) => typeof v !== 'number' || (type !== 'Float32List' && !Number.isInteger(v)),
        )
      )
        throw Error('fromList needs numeric values of the correct type.');
      this.allocate(args[0].length * Type.BYTES_PER_ELEMENT);
      data = Type.from(args[0]);
    } else {
      const bytes = integer(args[0]) * (Type.BYTES_PER_ELEMENT || 1);
      this.allocate(bytes);
      data = Type === DataView ? new DataView(new ArrayBuffer(bytes)) : new Type(args[0]);
    }
    return Type === DataView ? new DartByteData(data) : new DartTypedList(type, data);
  }
}
