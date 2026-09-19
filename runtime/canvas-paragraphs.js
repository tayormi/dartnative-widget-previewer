import { CanvasValue, CanvasPaint, enumName, finite, point, rect } from './canvas-values.js';
import { color } from './style-values.js';
import { fontFamilyCSS } from './font-family.js';

export const canvasFont = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const weight = (value) =>
  (({ normal: 400, bold: 700 })[enumName(value)] ??
    Number(String(enumName(value) || 400).replace(/^w/, ''))) ||
  400;
const props = (value) => value?.props ?? {};
const metricsNames = new Set([
  'width',
  'height',
  'lineCount',
  'longestLine',
  'didExceedMaxLines',
  'minIntrinsicWidth',
  'maxIntrinsicWidth',
  'alphabeticBaseline',
  'ideographicBaseline',
]);
const textFields = new Set([
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontFamily',
  'height',
  'letterSpacing',
  'wordSpacing',
  'decoration',
  'decorationColor',
  'shadows',
  'foreground',
  'fontVariations',
  'leadingDistribution',
]);
const paragraphFields = new Set([
  'textAlign',
  'textDirection',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'maxLines',
  'ellipsis',
  'height',
  'locale',
  'strutStyle',
  'leadingDistribution',
]);
function validateFields(value, allowed, label) {
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      throw Error(`${label}.${key} is not supported by browser paragraph layout.`);
}
function font(style) {
  const size = finite(style.fontSize ?? 14, 'Paragraph font size');
  if (size <= 0 || size > 512) throw Error('Paragraph font size must be from 0 to 512 points.');
  return `${enumName(style.fontStyle) === 'italic' ? 'italic ' : ''}${weight(style.fontWeight)} ${size}px ${style.fontFamily ? fontFamilyCSS(style.fontFamily) : canvasFont}`;
}
function decorations(value) {
  const name = enumName(value);
  return (
    { none: 'none', underline: 'underline', lineThrough: 'line-through', overline: 'overline' }[
      name
    ] ?? 'none'
  );
}

// Text is shaped and wrapped by the browser. The same measured DOM is painted
// into the SVG; selection boxes and line metrics therefore share its layout.
export class CanvasParagraphs {
  constructor(environment) {
    this.environment = environment;
    this.fontMetrics = new Map();
  }
  builder(style) {
    if (style?.valueType !== 'ParagraphStyle')
      throw Error('ParagraphBuilder needs a ParagraphStyle.');
    return new ParagraphBuilder(this, props(style));
  }
  metric(style, text = 'Mg') {
    const key = font(style),
      cacheKey = `${key}/${text}`;
    if (this.fontMetrics.has(cacheKey)) return this.fontMetrics.get(cacheKey);
    const doc = this.environment.document;
    if (!doc) throw Error('Paragraph layout needs a browser document.');
    const ctx = doc.createElement('canvas').getContext('2d');
    if (!ctx) throw Error('This browser cannot measure paragraph fonts.');
    ctx.font = key;
    const m = ctx.measureText(text),
      a = m.fontBoundingBoxAscent,
      d = m.fontBoundingBoxDescent;
    if (!Number.isFinite(a) || !Number.isFinite(d))
      throw Error('This browser does not expose font bounds for paragraph layout.');
    const result = { ascent: a, descent: d, font: key };
    if (this.fontMetrics.size >= 1024) this.fontMetrics.clear();
    this.fontMetrics.set(cacheKey, result);
    return result;
  }
  element(style, paragraph, spanHeight = false) {
    const doc = this.environment.document,
      el = doc.createElement('span'),
      s = el.style;
    s.font = font(style);
    s.color =
      color(
        style.foreground instanceof CanvasPaint ? style.foreground.read('color') : style.color,
      ) || '#000';
    if (style.backgroundColor) s.backgroundColor = color(style.backgroundColor) || '';
    if (style.letterSpacing != null) s.letterSpacing = `${finite(style.letterSpacing)}px`;
    if (style.wordSpacing != null) s.wordSpacing = `${finite(style.wordSpacing)}px`;
    s.textDecorationLine = decorations(style.decoration);
    s.textDecorationColor = color(style.decorationColor) || s.color;
    if (style.shadows) {
      if (!Array.isArray(style.shadows) || style.shadows.length > 20)
        throw Error('Paragraph shadows need a list of up to 20 Shadows.');
      s.textShadow = style.shadows
        .map((shadow) => {
          const p = props(shadow),
            o = point(p.offset ?? { symbol: 'Offset.zero' });
          return `${o.dx}px ${o.dy}px ${finite(p.blurRadius ?? 0)}px ${color(p.color) || '#000'}`;
        })
        .join(',');
    }
    if (style.fontVariations) {
      if (!Array.isArray(style.fontVariations) || style.fontVariations.length > 20)
        throw Error('Paragraph font variations need a list of up to 20 axes.');
      s.fontVariationSettings = style.fontVariations
        .map((v) => {
          if (v?.valueType !== 'FontVariation' || !/^[a-zA-Z0-9]{4}$/.test(v.args[0]))
            throw Error('Invalid paragraph font variation.');
          return `"${v.args[0]}" ${finite(v.args[1])}`;
        })
        .join(',');
    }
    if (style.foreground != null) {
      if (!(style.foreground instanceof CanvasPaint))
        throw Error('TextStyle.foreground needs a Paint.');
      if (enumName(style.foreground.read('style')) === 'stroke') {
        s.webkitTextStroke = `${style.foreground.read('strokeWidth')}px ${s.color}`;
        s.color = 'transparent';
      }
    }
    const m = this.metric(style),
      strut = props(paragraph.strutStyle),
      strutSize = strut.fontSize ?? paragraph.fontSize ?? 14;
    const natural = m.ascent + m.descent,
      requested =
        style.height == null
          ? natural
          : finite(style.height) *
            (spanHeight ? (style.fontSize ?? 14) : (paragraph.fontSize ?? 14));
    const strutHeight = paragraph.strutStyle
      ? strutSize * (strut.height ?? 1) + (strut.leading ?? 0) * strutSize
      : 0;
    const lineHeight = strut.forceStrutHeight ? strutHeight : Math.max(requested, strutHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0)
      throw Error('Paragraph line height must be positive.');
    s.lineHeight = `${lineHeight}px`;
    const even = enumName(style.leadingDistribution ?? paragraph.leadingDistribution) === 'even',
      leading = lineHeight - natural;
    const ascent = m.ascent + leading * (even ? 0.5 : m.ascent / natural),
      descent = lineHeight - ascent;
    const shift = ascent - (m.ascent + leading / 2);
    if (shift) {
      s.position = 'relative';
      s.top = `${shift}px`;
    }
    return {
      el,
      metrics: { ...m, lineHeight, ascentWithLeading: ascent, descentWithLeading: descent },
    };
  }
  dispose() {
    this.fontMetrics.clear();
  }
}
class ParagraphBuilder extends CanvasValue {
  constructor(owner, style) {
    super();
    validateFields(style, paragraphFields, 'ParagraphStyle');
    this.owner = owner;
    this.style = { ...style };
    this.stack = [];
    this.spans = [];
    this.length = 0;
  }
  invoke(name, args) {
    if (name === 'pushStyle') {
      if (args[0]?.valueType !== 'TextStyle')
        throw Error('ParagraphBuilder.pushStyle needs a TextStyle.');
      const value = props(args[0]);
      validateFields(value, textFields, 'TextStyle');
      this.stack.push({
        ...this.stack.at(-1),
        ...Object.fromEntries(Object.entries(value).filter(([, v]) => v != null)),
      });
      if (this.stack.length > 100) throw Error('Paragraph style stack limit reached.');
      return null;
    }
    if (name === 'popStyle') {
      this.stack.pop();
      return null;
    }
    if (name === 'addText') {
      if (typeof args[0] !== 'string') throw Error('ParagraphBuilder.addText needs a String.');
      this.length += args[0].length;
      if (this.length > 20000 || this.spans.length >= 1000)
        throw Error('Paragraph text limit reached.');
      this.spans.push({ text: args[0], style: { ...this.stack.at(-1) } });
      return null;
    }
    if (name === 'build')
      return new BrowserParagraph(
        this.owner,
        this.style,
        this.spans.map((s) => ({ ...s, style: { ...s.style } })),
      );
    return super.invoke(name, args);
  }
}
export class BrowserParagraph extends CanvasValue {
  constructor(owner, style, spans) {
    super();
    this.owner = owner;
    this.style = style;
    this.spans = spans;
    this.text = spans.map((s) => s.text).join('');
    this.lines = [];
    this.glyphs = [];
    this.metrics = Object.fromEntries(
      [...metricsNames].map((k) => [k, k === 'didExceedMaxLines' ? false : 0]),
    );
  }
  read(name) {
    if (metricsNames.has(name)) return this.metrics[name];
    return super.read(name);
  }
  invoke(name, args, props = {}) {
    if (name === 'layout') {
      if (args[0]?.valueType !== 'ParagraphConstraints')
        throw Error('Paragraph.layout needs ParagraphConstraints.');
      this.layout(args[0].props.width);
      return null;
    }
    if (name === 'getLineMetrics') return this.lines;
    if (name === 'getBoxesForRange') {
      if (Object.keys(props).some((k) => !['boxHeightStyle', 'boxWidthStyle'].includes(k)))
        throw Error('Unsupported paragraph range option.');
      return this.boxes(args[0], args[1]);
    }
    if (name === 'getPositionForOffset') return this.position(point(args[0]));
    return super.invoke(name, args, props);
  }
  makeRoot(width, end = this.text.length, ellipsis = '') {
    const doc = this.owner.environment.document,
      root = doc.createElement('div');
    root.className = 'dn-canvas-paragraph';
    Object.assign(root.style, {
      margin: '0',
      padding: '0',
      border: '0',
      boxSizing: 'content-box',
      width: `${width}px`,
      font: font(this.style),
      color: '#000',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      wordBreak: 'normal',
      textAlign: enumName(this.style.textAlign) || 'start',
      direction: enumName(this.style.textDirection) || 'ltr',
      overflow: 'visible',
      position: 'relative',
    });
    root.dir = enumName(this.style.textDirection) || 'ltr';
    if (this.style.locale) root.lang = String(this.style.locale);
    const base = { ...this.style, fontSize: this.style.fontSize ?? 14 };
    const defaultMetrics = this.owner.element(base, this.style);
    root.style.lineHeight = defaultMetrics.el.style.lineHeight;
    const runs = [];
    let index = 0;
    for (const span of this.spans) {
      const text = span.text.slice(0, Math.max(0, end - index));
      if (text) {
        const { el, metrics } = this.owner.element(
          { ...base, ...span.style },
          this.style,
          Object.hasOwn(span.style, 'height'),
        );
        el.textContent = text;
        root.append(el);
        runs.push({ el, text, index, metrics, source: true });
      }
      index += span.text.length;
      if (index >= end) break;
    }
    if (ellipsis) {
      const { el, metrics } = this.owner.element(
        {
          ...base,
          ...this.spans.find(
            (s, i) => this.spans.slice(0, i + 1).reduce((n, s) => n + s.text.length, 0) >= end,
          )?.style,
        },
        this.style,
      );
      el.textContent = ellipsis;
      root.append(el);
      runs.push({ el, text: ellipsis, index: end, metrics, source: false });
    }
    return { root, runs, baseMetrics: defaultMetrics.metrics };
  }
  measure(view) {
    const { root, runs, baseMetrics } = view,
      doc = root.ownerDocument,
      origin = root.getBoundingClientRect(),
      glyphs = [],
      groups = [];
    const segmenter = new Intl.Segmenter(this.style.locale || undefined, {
      granularity: 'grapheme',
    });
    for (const run of runs) {
      for (const segment of segmenter.segment(run.text)) {
        const range = doc.createRange();
        range.setStart(run.el.firstChild, segment.index);
        range.setEnd(run.el.firstChild, segment.index + segment.segment.length);
        const boxes = [...range.getClientRects()];
        range.detach();
        for (const box of boxes) {
          const baseline = box.top - origin.top + run.metrics.ascent;
          let group = groups.find((g) => Math.abs(g.baseline - baseline) < 1);
          if (!group) {
            group = {
              baseline,
              glyphs: [],
              ascent: baseMetrics.ascentWithLeading,
              descent: baseMetrics.descentWithLeading,
              unscaled: baseMetrics.ascent,
            };
            groups.push(group);
          }
          const glyph = {
            left: box.left - origin.left,
            top: box.top - origin.top,
            right: box.right - origin.left,
            bottom: box.bottom - origin.top,
            start: run.index + segment.index,
            end: run.index + segment.index + segment.segment.length,
            text: segment.segment,
            source: run.source,
            baseline,
          };
          group.glyphs.push(glyph);
          glyphs.push(glyph);
          group.ascent = Math.max(group.ascent, run.metrics.ascentWithLeading);
          group.descent = Math.max(group.descent, run.metrics.descentWithLeading);
          group.unscaled = Math.max(group.unscaled, run.metrics.ascent);
        }
      }
    }
    groups.sort((a, b) => a.baseline - b.baseline);
    const lines = groups.map((g, lineNumber) => {
      const visible = g.glyphs.filter((c) => c.text !== '\n'),
        left = visible.length ? Math.min(...visible.map((c) => c.left)) : 0,
        right = visible.length ? Math.max(...visible.map((c) => c.right)) : 0;
      for (const glyph of g.glyphs) glyph.line = lineNumber;
      return {
        lineNumber,
        hardBreak: g.glyphs.some((c) => c.text === '\n') || lineNumber === groups.length - 1,
        ascent: g.ascent,
        descent: g.descent,
        unscaledAscent: g.unscaled,
        height: g.ascent + g.descent,
        width: right - left,
        left,
        baseline: g.baseline,
      };
    });
    return { lines, glyphs, height: origin.height };
  }
  layout(width) {
    width = finite(width, 'Paragraph width');
    if (width <= 0 || width > 8192)
      throw Error('Paragraph width must be greater than zero and at most 8192 points.');
    const doc = this.owner.environment.document;
    if (!doc) throw Error('Paragraph layout needs a browser document.');
    const host = doc.createElement('div');
    host.inert = true;
    host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, {
      position: 'fixed',
      left: '-100000px',
      top: '0',
      visibility: 'hidden',
      pointerEvents: 'none',
      contain: 'layout style',
      width: `${width}px`,
    });
    doc.body.append(host);
    try {
      let view = this.makeRoot(width);
      host.append(view.root);
      let measured = this.measure(view);
      const full = measured;
      const intrinsic = view.root.cloneNode(true);
      intrinsic.style.width = 'max-content';
      intrinsic.style.overflowWrap = 'normal';
      host.append(intrinsic);
      const maxIntrinsicWidth = intrinsic.getBoundingClientRect().width;
      intrinsic.style.width = 'min-content';
      const minIntrinsicWidth = intrinsic.getBoundingClientRect().width;
      intrinsic.remove();
      const max = this.style.maxLines;
      if (max != null && (!Number.isInteger(max) || max < 1 || max > 1000))
        throw Error('Paragraph maxLines must be from 1 to 1000.');
      const exceeded = max != null && measured.lines.length > max;
      if (exceeded) {
        const segments = [
          ...new Intl.Segmenter(this.style.locale || undefined, {
            granularity: 'grapheme',
          }).segment(this.text),
        ];
        let low = 0,
          high = segments.length,
          winning = null;
        while (low <= high) {
          const mid = Math.floor((low + high) / 2),
            end = segments[mid]?.index ?? this.text.length,
            trial = this.makeRoot(width, end, this.style.ellipsis ?? '');
          host.replaceChildren(trial.root);
          const result = this.measure(trial);
          if (result.lines.length <= max) {
            winning = { view: trial, measured: result };
            low = mid + 1;
          } else high = mid - 1;
        }
        if (winning) {
          view = winning.view;
          measured = winning.measured;
          host.replaceChildren(view.root);
        }
      }
      this.element = view.root;
      this.constraintWidth = width;
      this.lines = measured.lines;
      this.glyphs = measured.glyphs.filter((g) => g.source);
      const longestLine = Math.max(0, ...this.lines.map((l) => l.width));
      this.metrics = {
        width: longestLine,
        height: measured.height,
        lineCount: this.lines.length,
        longestLine,
        didExceedMaxLines: exceeded,
        minIntrinsicWidth,
        maxIntrinsicWidth,
        alphabeticBaseline: this.lines[0]?.baseline ?? 0,
        ideographicBaseline: (this.lines[0]?.baseline ?? 0) + (this.lines[0]?.descent ?? 0),
      };
      this.fullLineCount = full.lines.length;
      this.element.remove();
    } finally {
      host.remove();
    }
  }
  boxes(start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end))
      throw Error('Paragraph selection offsets must be integers.');
    if (start < 0 || end <= start || start >= this.text.length) return [];
    end = Math.min(end, this.text.length);
    const selected = this.glyphs
        .filter((g) => g.end > start && g.start < end && g.right > g.left)
        .sort((a, b) => a.line - b.line || a.left - b.left),
      boxes = [];
    for (const g of selected) {
      const previous = boxes.at(-1);
      if (previous && previous.line === g.line && g.left <= previous.right + 1) {
        previous.right = Math.max(previous.right, g.right);
        previous.top = Math.min(previous.top, g.top);
        previous.bottom = Math.max(previous.bottom, g.bottom);
      } else
        boxes.push({ left: g.left, top: g.top, right: g.right, bottom: g.bottom, line: g.line });
    }
    return boxes.map((b) => ({
      left: b.left,
      top: b.top,
      right: b.right,
      bottom: b.bottom,
      width: b.right - b.left,
      height: b.bottom - b.top,
      direction: { symbol: `TextDirection.${enumName(this.style.textDirection) || 'ltr'}` },
      toRect: () => rect(b.left, b.top, b.right, b.bottom),
    }));
  }
  position({ dx, dy }) {
    let line = this.lines.reduce(
      (best, l) =>
        Math.abs(dy - (l.baseline + (l.descent - l.ascent) / 2)) <
        Math.abs(
          dy - ((best?.baseline ?? Infinity) + ((best?.descent ?? 0) - (best?.ascent ?? 0)) / 2),
        )
          ? l
          : best,
      null,
    );
    const glyphs = this.glyphs.filter((g) => g.line === line?.lineNumber && g.text !== '\n');
    let closest = { distance: Infinity, offset: 0, upstream: false };
    for (const g of glyphs) {
      const rtl =
        /[\u0590-\u08ff]/u.test(g.text) ||
        (enumName(this.style.textDirection) === 'rtl' && !/[a-zA-Z0-9]/.test(g.text));
      for (const [x, offset, upstream] of [
        [rtl ? g.right : g.left, g.start, false],
        [rtl ? g.left : g.right, g.end, true],
      ]) {
        const distance = Math.abs(dx - x);
        if (distance < closest.distance) closest = { distance, offset, upstream };
      }
    }
    const name = closest.upstream ? 'upstream' : 'downstream';
    return {
      offset: closest.offset,
      affinity: {
        enumType: 'TextAffinity',
        name,
        index: name === 'upstream' ? 0 : 1,
        symbol: `TextAffinity.${name}`,
      },
    };
  }
}
