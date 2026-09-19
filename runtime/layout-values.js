import { color } from './style-values.js';
import { symbolName as symbol } from './platform.js';
import { fontFamilyCSS } from './font-family.js';
export const dimension = (n) => (n === Infinity ? '100%' : n != null ? `${n}px` : '');
export function insetValues(value) {
  const p = value?.props || {},
    a = value?.args || [];
  switch (value?.valueType) {
    case 'EdgeInsets.all':
      return [a[0], a[0], a[0], a[0]];
    case 'EdgeInsets.symmetric':
      return [p.vertical ?? 0, p.horizontal ?? 0, p.vertical ?? 0, p.horizontal ?? 0];
    case 'EdgeInsets.only':
      return [p.top ?? 0, p.right ?? 0, p.bottom ?? 0, p.left ?? 0];
    case 'EdgeInsets.fromLTRB':
      return [a[1], a[2], a[3], a[0]];
    default:
      return [0, 0, 0, 0];
  }
}
export const insets = (value) =>
  value
    ? insetValues(value)
        .map((n) => `${n}px`)
        .join(' ')
    : undefined;
export function borderRadius(value) {
  if (!value) return '';
  const p = value.props || {},
    a = value.args || [],
    radius = (r) => r?.args?.[0] ?? 0;
  if (value.valueType === 'BorderRadius.circular') return `${a[0]}px`;
  if (value.valueType === 'BorderRadius.all') return `${radius(a[0])}px`;
  if (value.valueType === 'BorderRadius.vertical')
    return `${radius(p.top)}px ${radius(p.top)}px ${radius(p.bottom)}px ${radius(p.bottom)}px`;
  return ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']
    .map((k) => `${radius(p[k])}px`)
    .join(' ');
}
export const axisAlignment = (value) =>
  ({
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    stretch: 'stretch',
    baseline: 'baseline',
    spaceBetween: 'space-between',
    spaceAround: 'space-around',
    spaceEvenly: 'space-evenly',
  })[symbol(value)] || 'flex-start';
export function placeAlignment(value) {
  return (
    {
      topLeft: 'start start',
      topCenter: 'start center',
      topRight: 'start end',
      centerLeft: 'center start',
      center: 'center center',
      centerRight: 'center end',
      bottomLeft: 'end start',
      bottomCenter: 'end center',
      bottomRight: 'end end',
    }[symbol(value)] || 'center center'
  );
}
export function constraintsStyle(value) {
  if (!value) return {};
  let p = { ...value.props };
  if (value.valueType === 'BoxConstraints.tight')
    p = {
      minWidth: value.args[0]?.args?.[0],
      maxWidth: value.args[0]?.args?.[0],
      minHeight: value.args[0]?.args?.[1],
      maxHeight: value.args[0]?.args?.[1],
    };
  if (['BoxConstraints.tightFor', 'BoxConstraints.expand'].includes(value.valueType)) {
    const expand = value.valueType.endsWith('expand');
    p = {
      minWidth: p.width ?? (expand ? Infinity : 0),
      maxWidth: p.width ?? Infinity,
      minHeight: p.height ?? (expand ? Infinity : 0),
      maxHeight: p.height ?? Infinity,
    };
  }
  return {
    minWidth: dimension(p.minWidth ?? 0),
    minHeight: dimension(p.minHeight ?? 0),
    maxWidth: p.maxWidth === Infinity ? 'none' : dimension(p.maxWidth),
    maxHeight: p.maxHeight === Infinity ? 'none' : dimension(p.maxHeight),
  };
}
export function gradientCSS(value) {
  if (!value) return '';
  const p = value.props || {},
    colors = p.colors || [];
  const points = {
    topLeft: [-1, -1],
    topCenter: [0, -1],
    topRight: [1, -1],
    centerLeft: [-1, 0],
    center: [0, 0],
    centerRight: [1, 0],
    bottomLeft: [-1, 1],
    bottomCenter: [0, 1],
    bottomRight: [1, 1],
  };
  const start = points[symbol(p.begin)] || [-1, 0],
    end = points[symbol(p.end)] || [1, 0];
  const angle = (Math.atan2(end[0] - start[0], start[1] - end[1]) * 180) / Math.PI;
  return `linear-gradient(${angle}deg, ${colors.map((c, i) => color(c) + (p.stops?.[i] != null ? ` ${p.stops[i] * 100}%` : '')).join(', ')})`;
}
export function applyTextStyle(el, style) {
  const s = style?.props || {};
  Object.assign(el.style, {
    fontFamily: s.fontFamily
      ? [s.fontFamily, ...(s.fontFamilyFallback || [])].map(fontFamilyCSS).join(',')
      : '',
    fontSize: dimension(s.fontSize),
    fontWeight: String(symbol(s.fontWeight) || '').replace(/^w/, ''),
    fontStyle: symbol(s.fontStyle) || '',
    color: color(s.color) || '',
    lineHeight: s.height ?? '',
    letterSpacing: dimension(s.letterSpacing),
    wordSpacing: dimension(s.wordSpacing),
    textDecorationLine:
      { lineThrough: 'line-through' }[symbol(s.decoration)] || symbol(s.decoration) || '',
    textDecorationColor: color(s.decorationColor) || '',
    backgroundColor: color(s.backgroundColor) || '',
    textShadow: (s.shadows || [])
      .map(
        (v) =>
          `${v.props?.offset?.args?.[0] ?? 0}px ${v.props?.offset?.args?.[1] ?? 0}px ${v.props?.blurRadius ?? 0}px ${color(v.props?.color) || '#000'}`,
      )
      .join(', '),
  });
}
