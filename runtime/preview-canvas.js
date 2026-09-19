import { DartObject } from './dart-environment.js';
import {
  DrawingCanvas,
  canvasValue,
  finite,
  point,
  rectangle,
  size,
  enumName,
} from './canvas-values.js';
import { CanvasParagraphs, BrowserParagraph, canvasFont } from './canvas-paragraphs.js';
import { color } from './style-values.js';

const ns = 'http://www.w3.org/2000/svg';
function svg(doc, name, attrs = {}) {
  const el = doc.createElementNS(ns, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
function roundedPath(value) {
  if (value?.valueType !== 'RRect') throw Error('Canvas needs an RRect.');
  const r = value.rect,
    limit = Math.min(Math.abs(r.width), Math.abs(r.height)) / 2,
    [tl, tr, br, bl] = ['tlRadius', 'trRadius', 'brRadius', 'blRadius'].map((k) =>
      Math.min(limit, value[k]),
    );
  return `M ${r.left + tl} ${r.top} H ${r.right - tr} Q ${r.right} ${r.top} ${r.right} ${r.top + tr} V ${r.bottom - br} Q ${r.right} ${r.bottom} ${r.right - br} ${r.bottom} H ${r.left + bl} Q ${r.left} ${r.bottom} ${r.left} ${r.bottom - bl} V ${r.top + tl} Q ${r.left} ${r.top} ${r.left + tl} ${r.top} Z`;
}
function arcPath(r, start, sweep, move = true) {
  rectangle(r);
  const cx = (r.left + r.right) / 2,
    cy = (r.top + r.bottom) / 2,
    rx = Math.abs(r.width / 2),
    ry = Math.abs(r.height / 2),
    position = (a) => `${cx + Math.cos(a) * rx} ${cy + Math.sin(a) * ry}`;
  const segments = Math.max(1, Math.ceil(Math.abs(sweep) / Math.PI));
  if (segments > 1000) throw Error('Canvas arc sweep limit reached.');
  let path = `${move ? 'M' : 'L'} ${position(start)}`;
  for (let i = 1; i <= segments; i++)
    path += ` A ${rx} ${ry} 0 0 ${sweep >= 0 ? 1 : 0} ${position(start + (sweep * i) / segments)}`;
  return path;
}
function pathData(value) {
  if (!value?.canvasPath) throw Error('Canvas needs a Path.');
  let path = '';
  for (const { name, args: a } of value.canvasPath) {
    if (name === 'moveTo') path += ` M ${a.join(' ')}`;
    if (name === 'lineTo') path += ` L ${a.join(' ')}`;
    if (name === 'cubicTo') path += ` C ${a.join(' ')}`;
    if (name === 'close') path += ' Z';
    if (name === 'arcTo') path += ' ' + arcPath(a[0], a[1], a[2], a[3] || !path);
    if (name === 'addRRect') path += ' ' + roundedPath(a[0]);
    if (name === 'addRect') {
      const r = rectangle(a[0]);
      path += ` M ${r.left} ${r.top} H ${r.right} V ${r.bottom} H ${r.left} Z`;
    }
    if (name === 'addOval') path += ' ' + arcPath(a[0], 0, 2 * Math.PI) + ' Z';
  }
  return path;
}

export class PreviewCanvas {
  constructor(runtime) {
    this.runtime = runtime;
    this.paragraphs = new CanvasParagraphs(runtime.browserEnvironment);
    this.records = new Map();
    this.serial = 0;
  }
  value(name, args, props) {
    return canvasValue(name, args, props, this.paragraphs);
  }
  invoke(fn, args) {
    const r = this.runtime,
      steps = r.steps,
      depth = r.depth;
    r.steps = 0;
    r.depth = 0;
    try {
      return fn(...args);
    } finally {
      r.steps = steps;
      r.depth = depth;
    }
  }
  paint(painter, width, height, key, doc) {
    if (!(painter instanceof DartObject) || !this.runtime.isSubclass(painter.name, 'CustomPainter'))
      throw Error('CustomPaint needs a CustomPainter.');
    const old = this.records.get(key),
      changed =
        !old ||
        old.width !== width ||
        old.height !== height ||
        old.painter.name !== painter.name ||
        this.invoke(painter.get('shouldRepaint'), [old.painter]);
    if (!changed) {
      old.painter = painter;
      return old.element;
    }
    const canvas = new DrawingCanvas();
    this.invoke(painter.get('paint'), [canvas, size(width, height)]);
    const record = { painter, width, height, element: null, leases: [], active: true };
    try {
      record.element = this.surface(doc, canvas.commands, width, height, record);
    } catch (error) {
      this.drop(record);
      throw error;
    }
    if (old) this.drop(old);
    this.records.set(key, record);
    return record.element;
  }
  surface(doc, commands, width, height, record) {
    const prefix = `dn-canvas-${++this.serial}`,
      root = svg(doc, 'svg', { width, height, viewBox: `0 0 ${width} ${height}` }),
      defs = svg(doc, 'defs');
    root.append(defs);
    root.style.display = 'block';
    root.style.overflow = 'hidden';
    root.dataset.drawCommands = commands.length;
    let current = root,
      serial = 0;
    const stack = [];
    const paint = (element, p) => {
      const stroke = enumName(p.style) === 'stroke',
        shade = color(p.color) || '#000';
      element.setAttribute(stroke ? 'stroke' : 'fill', shade);
      element.setAttribute(stroke ? 'fill' : 'stroke', 'none');
      if (stroke) {
        element.setAttribute('stroke-width', p.strokeWidth || 1);
        element.setAttribute('stroke-linecap', enumName(p.strokeCap));
        element.setAttribute('stroke-linejoin', enumName(p.strokeJoin));
      }
      // The iOS backend applies shaders to filled shapes; strokes use color.
      if (p.shader && !stroke) {
        const [start, end, colors, stops] = p.shader.args,
          from = point(start),
          radial = p.shader.valueType === 'Gradient.radial',
          id = `${prefix}-g${++serial}`;
        const gradient = svg(
          doc,
          radial ? 'radialGradient' : 'linearGradient',
          radial
            ? { id, gradientUnits: 'userSpaceOnUse', cx: from.dx, cy: from.dy, r: end }
            : {
                id,
                gradientUnits: 'userSpaceOnUse',
                x1: from.dx,
                y1: from.dy,
                x2: point(end).dx,
                y2: point(end).dy,
              },
        );
        colors.forEach((value, i) =>
          gradient.append(svg(doc, 'stop', { offset: stops[i], 'stop-color': color(value) })),
        );
        defs.append(gradient);
        element.setAttribute('fill', `url(#${id})`);
      }
      return element;
    };
    const shape = (kind, value) =>
      kind === 'Rect'
        ? (() => {
            const r = rectangle(value);
            return svg(doc, 'rect', {
              x: r.left,
              y: r.top,
              width: Math.max(0, r.width),
              height: Math.max(0, r.height),
            });
          })()
        : svg(doc, 'path', { d: kind === 'RRect' ? roundedPath(value) : pathData(value) });
    for (const { name, args: a, props: p } of commands) {
      if (name === 'save') {
        stack.push(current);
        const group = svg(doc, 'g');
        current.append(group);
        current = group;
        continue;
      }
      if (name === 'restore') {
        current = stack.pop();
        continue;
      }
      if (['translate', 'rotate', 'scale'].includes(name)) {
        const transform =
            name === 'rotate'
              ? `rotate(${(a[0] * 180) / Math.PI})`
              : name === 'scale'
                ? `scale(${a[0]} ${a[1] ?? a[0]})`
                : `translate(${a[0]} ${a[1]})`,
          group = svg(doc, 'g', { transform });
        current.append(group);
        current = group;
        continue;
      }
      if (name.startsWith('clip')) {
        const id = `${prefix}-c${++serial}`,
          clip = svg(doc, 'clipPath', { id });
        clip.append(shape(name.slice(4), a[0]));
        defs.append(clip);
        const group = svg(doc, 'g', { 'clip-path': `url(#${id})` });
        current.append(group);
        current = group;
        continue;
      }
      let element;
      if (['drawRect', 'drawRRect', 'drawPath'].includes(name))
        element = shape(name.slice(4), a[0]);
      if (name === 'drawPaint') element = svg(doc, 'rect', { x: 0, y: 0, width, height });
      if (name === 'drawCircle') {
        const c = point(a[0]),
          radius = finite(a[1]);
        if (radius < 0) throw Error('Circle radius cannot be negative.');
        element = svg(doc, 'circle', { cx: c.dx, cy: c.dy, r: radius });
      }
      if (name === 'drawLine') {
        const from = point(a[0]),
          to = point(a[1]);
        element = svg(doc, 'line', { x1: from.dx, y1: from.dy, x2: to.dx, y2: to.dy });
        const pen = { ...a[2].canvasPaint, style: { symbol: 'PaintingStyle.stroke' } };
        current.append(paint(element, pen));
        continue;
      }
      if (name === 'drawArc') {
        const r = rectangle(a[0]),
          center = `M ${(r.left + r.right) / 2} ${(r.top + r.bottom) / 2}`,
          d = (a[3] ? center + ' ' : '') + arcPath(r, a[1], a[2], !a[3]) + (a[3] ? ' Z' : '');
        element = svg(doc, 'path', { d });
      }
      if (element) {
        current.append(paint(element, a.at(-1).canvasPaint));
        continue;
      }
      if (name === 'drawText') {
        const origin = point(a[1]);
        element = svg(doc, 'text', {
          x: origin.dx,
          y: origin.dy,
          fill: color(p.color) || '#000',
          'font-size': finite(p.fontSize ?? 14),
          'font-weight': p.fontWeight ?? 400,
          'font-family': canvasFont,
          'text-anchor': ['start', 'middle', 'end'][p.textAlign ?? 0] || 'start',
          'dominant-baseline': 'text-before-edge',
        });
        element.textContent = String(a[0]);
        current.append(element);
        continue;
      }
      if (name === 'drawParagraph') {
        const paragraph = a[0],
          origin = point(a[1]);
        if (!(paragraph instanceof BrowserParagraph) || !paragraph.element)
          throw Error('Layout the Paragraph before drawing it.');
        const box = svg(doc, 'foreignObject', {
          x: origin.dx,
          y: origin.dy,
          width: paragraph.constraintWidth,
          height: paragraph.metrics.height,
        });
        box.style.overflow = 'visible';
        box.append(paragraph.element.cloneNode(true));
        current.append(box);
        continue;
      }
      if (name === 'drawImage' || name === 'drawImageRect') {
        const image = a[0];
        if (image?.valueType !== 'CanvasImage.network')
          throw Error('Canvas drawing needs a supported CanvasImage.');
        const { width: iw, height: ih } = image.props,
          origin = name === 'drawImage' ? point(a[1]) : null,
          destination =
            name === 'drawImage'
              ? { left: origin.dx, top: origin.dy, width: iw, height: ih }
              : rectangle(a[2]),
          source =
            name === 'drawImage' ? { left: 0, top: 0, width: iw, height: ih } : rectangle(a[1]);
        const entry = [...this.runtime.images.entries.values()].find(
          (e) => e.url === image.args[0] && e.status === 'ready',
        );
        // As on iOS, a CanvasImage must have been precached before painting.
        if (!entry) continue;
        const lease = this.runtime.images.acquire(image.args[0]);
        record.leases.push(lease);
        const bitmap = entry.bitmap,
          canvas = doc.createElement('canvas'),
          scale = Math.min(3, Math.max(1, this.runtime.browserEnvironment.devicePixelRatio || 1));
        const pixelWidth = Math.ceil(destination.width * scale),
          pixelHeight = Math.ceil(destination.height * scale);
        if (
          pixelWidth <= 0 ||
          pixelHeight <= 0 ||
          pixelWidth > 8192 ||
          pixelHeight > 8192 ||
          pixelWidth * pixelHeight > 16e6
        )
          throw Error('Canvas image destination exceeds its pixel budget.');
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        const context = canvas.getContext('2d');
        context.scale(scale, scale);
        context.drawImage(
          bitmap,
          (source.left / iw) * bitmap.width,
          (source.top / ih) * bitmap.height,
          (source.width / iw) * bitmap.width,
          (source.height / ih) * bitmap.height,
          0,
          0,
          destination.width,
          destination.height,
        );
        const box = svg(doc, 'foreignObject', {
          x: destination.left,
          y: destination.top,
          width: destination.width,
          height: destination.height,
        });
        box.append(canvas);
        current.append(box);
      }
    }
    return root;
  }
  drop(record) {
    record.active = false;
    for (const lease of record.leases) lease.release();
    record.leases = [];
  }
  finishFrame(keys) {
    for (const [key, record] of this.records)
      if (!keys.has(key)) {
        this.drop(record);
        this.records.delete(key);
      }
  }
  dispose() {
    for (const record of this.records.values()) this.drop(record);
    this.records.clear();
    this.paragraphs.dispose();
  }
}
export function mountCanvas(element, tree, runtime, keys, child) {
  const { props: p, paintKey: key } = tree,
    dimensions = p.size;
  const width = dimensions?.width ?? dimensions?.args?.[0],
    height = dimensions?.height ?? dimensions?.args?.[1];
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 8192 ||
    height > 8192
  )
    throw Error('CustomPaint needs a finite, positive Size up to 8192 points in the browser.');
  Object.assign(element.style, {
    position: 'relative',
    width: `${width}px`,
    height: `${height}px`,
    flexShrink: '0',
  });
  for (const slot of ['painter', 'foregroundPainter']) {
    if (slot === 'foregroundPainter' && p.child) {
      const host = element.ownerDocument.createElement('div');
      Object.assign(host.style, { position: 'absolute', inset: '0' });
      host.append(child());
      element.append(host);
    }
    if (!p[slot]) continue;
    const id = `${key}/${slot}`;
    keys.add(id);
    const drawing = runtime.canvas.paint(p[slot], width, height, id, element.ownerDocument);
    Object.assign(drawing.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    element.append(drawing);
  }
}
