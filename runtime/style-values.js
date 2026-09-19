export function color(x) {
  if (typeof x === 'string') return x;
  if (x?.valueType === 'Color') {
    const hex = (x.args[0] >>> 0).toString(16).padStart(8, '0');
    return `#${hex.slice(2)}${hex.slice(0, 2)}`;
  }
}
export function borderStyles(value) {
  if (!value) return {};
  const side = (value) => {
    const p = value?.props || {};
    if (
      value == null ||
      value?.symbol === 'BorderSide.none' ||
      p.style?.symbol === 'BorderStyle.none'
    )
      return 'none';
    return `${p.width ?? 1}px solid ${color(p.color) || '#000'}`;
  };
  if (value.valueType === 'Border')
    return Object.fromEntries(
      ['top', 'right', 'bottom', 'left'].map((name) => [
        `border${name[0].toUpperCase() + name.slice(1)}`,
        side(value.props?.[name]),
      ]),
    );
  return { border: side(value) };
}
export function boxShadows(value) {
  if (value == null) return '';
  if (!Array.isArray(value) || value.length > 20)
    throw Error('BoxDecoration.boxShadow needs a list of up to 20 BoxShadow values.');
  return value
    .map((shadow) => {
      if (shadow?.valueType !== 'BoxShadow') throw Error('Expected a BoxShadow value.');
      const p = shadow.props || {},
        offset = p.offset;
      if (p.blurStyle != null)
        throw Error(
          'BoxShadow supports color, offset, blurRadius and spreadRadius; omit blurStyle.',
        );
      if (offset && offset.valueType !== 'Offset' && offset.symbol !== 'Offset.zero')
        throw Error('BoxShadow.offset needs an Offset.');
      const x = offset?.args?.[0] ?? 0,
        y = offset?.args?.[1] ?? 0,
        blur = p.blurRadius ?? 0,
        spread = p.spreadRadius ?? 0;
      if (
        ![x, y, blur, spread].every((n) => typeof n === 'number' && Number.isFinite(n)) ||
        blur < 0
      )
        throw Error('BoxShadow needs finite dimensions and a nonnegative blurRadius.');
      const shade = p.color == null ? '#000000' : color(p.color);
      if (!shade) throw Error('BoxShadow.color needs a Color value.');
      return `${x}px ${y}px ${blur}px ${spread}px ${shade}`;
    })
    .join(', ');
}
