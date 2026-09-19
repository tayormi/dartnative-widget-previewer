import { color } from './style-values.js';

export const enumName = (value) => value?.symbol?.split('.').at(-1) ?? value;
export function finite(value, name = 'Canvas coordinate') {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e7)
    throw Error(`${name} must be finite and within the canvas coordinate limit.`);
  return value;
}
export const offset = (x = 0, y = 0) => ({
  valueType: 'Offset',
  args: [finite(x), finite(y)],
  props: {},
  dx: x,
  dy: y,
});
export const size = (width = 0, height = 0) => ({
  valueType: 'Size',
  args: [finite(width), finite(height)],
  props: {},
  width,
  height,
});
export function point(value) {
  if (value?.symbol === 'Offset.zero') return { dx: 0, dy: 0 };
  if (value?.valueType === 'Offset')
    return { dx: finite(value.args[0]), dy: finite(value.args[1]) };
  if (value && Object.hasOwn(value, 'dx') && Object.hasOwn(value, 'dy'))
    return { dx: finite(value.dx), dy: finite(value.dy) };
  throw Error('Canvas needs an Offset.');
}
export const rect = (left, top, right, bottom) => ({
  valueType: 'Rect',
  left: finite(left),
  top: finite(top),
  right: finite(right),
  bottom: finite(bottom),
  width: finite(right - left),
  height: finite(bottom - top),
});
export function rectangle(value) {
  if (value?.valueType !== 'Rect') throw Error('Canvas needs a Rect.');
  return value;
}
export const canvasConstructors = new Set([
  'Paint',
  'Path',
  'Rect.fromLTWH',
  'Rect.fromLTRB',
  'Rect.fromCircle',
  'RRect.fromRectAndRadius',
  'RRect.fromLTRBAndCornerRadii',
  'Gradient.linear',
  'Gradient.radial',
  'ParagraphStyle',
  'ParagraphConstraints',
  'ParagraphBuilder',
  'StrutStyle',
  'FontVariation.weight',
  'FontVariation',
  'CanvasImage.network',
  'NetworkImage',
]);
export class CanvasValue {
  read(name) {
    throw Error(`Unsupported ${this.constructor.name} property: ${name}`);
  }
  invoke(name) {
    throw Error(`Unsupported ${this.constructor.name} method: ${name}`);
  }
}
const paintDefaults = () => ({
  color: '#000000',
  style: { symbol: 'PaintingStyle.fill' },
  strokeWidth: 1,
  strokeCap: { symbol: 'StrokeCap.butt' },
  strokeJoin: { symbol: 'StrokeJoin.miter' },
  isAntiAlias: true,
  shader: null,
  blendMode: { symbol: 'BlendMode.srcOver' },
  maskFilter: null,
  imageFilter: null,
});
export class CanvasPaint extends CanvasValue {
  constructor(props = {}) {
    super();
    this.fields = paintDefaults();
    for (const [key, value] of Object.entries(props)) this.write(key, value);
  }
  read(name) {
    if (Object.hasOwn(this.fields, name)) return this.fields[name];
    return super.read(name);
  }
  write(name, value) {
    if (!Object.hasOwn(this.fields, name)) throw Error(`Unsupported Paint property: ${name}`);
    if (name === 'color' && !color(value)) throw Error('Paint.color needs a Color.');
    const enums = {
      style: ['fill', 'stroke'],
      strokeCap: ['butt', 'round', 'square'],
      strokeJoin: ['miter', 'round', 'bevel'],
    };
    if (enums[name] && !enums[name].includes(enumName(value)))
      throw Error(`Invalid Paint.${name}.`);
    if (name === 'strokeWidth' && finite(value, 'Stroke width') < 0)
      throw Error('Stroke width cannot be negative.');
    if (
      name === 'shader' &&
      value != null &&
      !['Gradient.linear', 'Gradient.radial'].includes(value.valueType)
    )
      throw Error('Paint.shader needs a supported Gradient.');
    if (
      (name === 'blendMode' && enumName(value) !== 'srcOver') ||
      (['maskFilter', 'imageFilter'].includes(name) && value != null) ||
      (name === 'isAntiAlias' && value !== true)
    )
      throw Error(`Paint.${name} is not supported by the browser canvas.`);
    this.fields[name] = value;
    return value;
  }
  snapshot() {
    return { ...this.fields };
  }
}
export class CanvasPath extends CanvasValue {
  constructor() {
    super();
    this.operations = [];
  }
  invoke(name, args) {
    if (this.operations.length >= 10000) throw Error('Canvas path operation limit reached.');
    const arity = {
      moveTo: 2,
      lineTo: 2,
      cubicTo: 6,
      arcTo: 4,
      close: 0,
      addRect: 1,
      addOval: 1,
      addRRect: 1,
    };
    if (!Object.hasOwn(arity, name) || args.length !== arity[name])
      throw Error(`Unsupported Path.${name} arguments.`);
    if (['moveTo', 'lineTo', 'cubicTo'].includes(name)) args.forEach((v) => finite(v));
    if (['arcTo', 'addRect', 'addOval'].includes(name)) rectangle(args[0]);
    if (name === 'arcTo') {
      finite(args[1]);
      finite(args[2]);
      if (typeof args[3] !== 'boolean') throw Error('Path.arcTo needs forceMoveTo.');
    }
    if (name === 'addRRect' && args[0]?.valueType !== 'RRect')
      throw Error('Path.addRRect needs an RRect.');
    this.operations.push({ name, args: [...args] });
    return null;
  }
}
export function canvasValue(name, args, props, paragraphs) {
  if (name === 'Paint') {
    if (args.length) throw Error('Paint takes named arguments.');
    return new CanvasPaint(props);
  }
  if (name === 'Path') {
    if (args.length || Object.keys(props).length) throw Error('Path takes no arguments.');
    return new CanvasPath();
  }
  if (name === 'Rect.fromLTRB') return rect(...args);
  if (name === 'Rect.fromLTWH') return rect(args[0], args[1], args[0] + args[2], args[1] + args[3]);
  if (name === 'Rect.fromCircle') {
    const p = point(props.center),
      r = finite(props.radius);
    return rect(p.dx - r, p.dy - r, p.dx + r, p.dy + r);
  }
  if (name.startsWith('RRect.')) {
    const r = name.endsWith('fromRectAndRadius') ? rectangle(args[0]) : rect(...args),
      all = name.endsWith('fromRectAndRadius') ? args[1] : 0;
    const result = { valueType: 'RRect', rect: r };
    for (const key of ['tlRadius', 'trRadius', 'brRadius', 'blRadius']) {
      result[key] = finite(props[key] ?? all);
      if (result[key] < 0) throw Error('Rounded corner radius cannot be negative.');
    }
    return result;
  }
  if (name.startsWith('Gradient.')) {
    const radial = name.endsWith('radial'),
      colors = args[2],
      stops = args[3] ?? colors?.map((_, i) => i / (colors.length - 1));
    point(args[0]);
    if (radial) {
      if (finite(args[1]) <= 0) throw Error('Gradient radius must be positive.');
    } else point(args[1]);
    if (
      !Array.isArray(colors) ||
      colors.length < 2 ||
      colors.length > 256 ||
      colors.some((v) => !color(v))
    )
      throw Error('Gradient needs 2–256 Colors.');
    if (
      !Array.isArray(stops) ||
      stops.length !== colors.length ||
      stops.some((v, i) => !Number.isFinite(v) || v < 0 || v > 1 || (i > 0 && v < stops[i - 1]))
    )
      throw Error('Gradient color stops must be ordered from 0 to 1.');
    if (
      (args[4] != null && enumName(args[4]) !== 'clamp') ||
      args.slice(5).some((v) => v != null) ||
      Object.keys(props).length
    )
      throw Error(
        'The iOS browser gradient supports clamp tiling without transforms or focal offsets.',
      );
    return { valueType: name, args: [args[0], args[1], colors.slice(), stops.slice()], props: {} };
  }
  if (name === 'ParagraphBuilder') return paragraphs.builder(args[0]);
  if (name === 'FontVariation.weight')
    return { valueType: 'FontVariation', args: ['wght', finite(args[0])], props: {} };
  if (name === 'FontVariation') {
    if (typeof args[0] !== 'string' || args[0].length !== 4)
      throw Error('FontVariation needs a four-letter axis.');
    return { valueType: name, args: [args[0], finite(args[1])], props: {} };
  }
  if (name === 'NetworkImage' || name === 'CanvasImage.network') {
    if (typeof args[0] !== 'string') throw Error(`${name} needs an image URL.`);
    if (
      name === 'CanvasImage.network' &&
      (!Number.isFinite(props.width) ||
        props.width <= 0 ||
        !Number.isFinite(props.height) ||
        props.height <= 0)
    )
      throw Error('CanvasImage needs positive width and height.');
    return { valueType: name, args, props };
  }
  return { valueType: name, args, props };
}

export class DrawingCanvas extends CanvasValue {
  constructor() {
    super();
    this.commands = [];
    this.saveDepth = 0;
  }
  invoke(name, args, props = {}) {
    if (this.commands.length >= 10000) throw Error('Canvas drawing operation limit reached.');
    const counts = {
      save: 0,
      restore: 0,
      translate: 2,
      rotate: 1,
      scale: [1, 2],
      clipRect: 1,
      clipRRect: 1,
      clipPath: 1,
      drawRect: 2,
      drawRRect: 2,
      drawCircle: 3,
      drawLine: 3,
      drawArc: 5,
      drawPath: 2,
      drawPaint: 1,
      drawText: 2,
      drawParagraph: 2,
      drawImage: 3,
      drawImageRect: 4,
    };
    const count = counts[name];
    if (
      count == null ||
      (Array.isArray(count) ? !count.includes(args.length) : args.length !== count)
    )
      throw Error(`Unsupported Canvas.${name} arguments.`);
    if (name === 'save') this.saveDepth++;
    if (name === 'restore') {
      if (!this.saveDepth) throw Error('Canvas.restore has no matching save.');
      this.saveDepth--;
    }
    if (['translate', 'rotate', 'scale'].includes(name)) args.forEach((v) => finite(v));
    const frozen = args.map((value) =>
      value instanceof CanvasPaint
        ? { canvasPaint: value.snapshot() }
        : value instanceof CanvasPath
          ? { canvasPath: value.operations.map((op) => ({ ...op, args: [...op.args] })) }
          : value,
    );
    if (
      name.startsWith('draw') &&
      !['drawText', 'drawParagraph'].includes(name) &&
      !frozen.at(-1)?.canvasPaint
    )
      throw Error(`Canvas.${name} needs a Paint.`);
    if (
      name === 'drawText' &&
      Object.keys(props).some(
        (key) => !['fontSize', 'color', 'fontWeight', 'textAlign'].includes(key),
      )
    )
      throw Error('Unsupported Canvas.drawText option.');
    this.commands.push({ name, args: frozen, props: { ...props } });
    return null;
  }
}
