const node = (tag, className, text) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text != null) el.textContent = text;
  return el;
};
export function colorSelection(initial) {
  const value = initial?.args?.[0];
  if (typeof value === 'number')
    return {
      hex: `#${((value >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`,
      alpha: value >>> 24,
    };
  return {
    hex: typeof initial === 'string' && /^#[\da-f]{6}$/i.test(initial) ? initial : '#0a84ff',
    alpha: 255,
  };
}
export function selectedColor(selection) {
  return {
    valueType: 'Color',
    args: [(selection.alpha * 0x1000000 + parseInt(selection.hex.slice(1), 16)) >>> 0],
    props: {},
  };
}
const hues = [
  '#00a5bf',
  '#007aff',
  '#5856d6',
  '#af52de',
  '#ff2d55',
  '#ff3b30',
  '#ff9500',
  '#ffcc00',
  '#a8d936',
  '#34c759',
  '#00866b',
  '#607d8b',
];
export function renderColorPicker(overlay, runtime) {
  overlay.color ??= colorSelection(overlay.props.initialColor);
  if (overlay.props.supportsAlpha === false) overlay.color.alpha = 255;
  const root = node('div', 'native-color-picker'),
    palette = node('div', 'native-color-grid');
  palette.setAttribute('aria-label', 'Color palette');
  const swatches = Array.from(
    { length: 12 },
    (_, i) =>
      `#${Math.round(255 - (i * 255) / 11)
        .toString(16)
        .padStart(2, '0')
        .repeat(3)}`,
  );
  for (const mix of [-0.65, -0.35, 0, 0.3, 0.55, 0.8])
    for (const hex of hues) {
      const rgb = hex
        .slice(1)
        .match(/../g)
        .map((n) => parseInt(n, 16));
      swatches.push(
        '#' +
          rgb
            .map((v) =>
              Math.round(mix < 0 ? v * (1 + mix) : v + (255 - v) * mix)
                .toString(16)
                .padStart(2, '0'),
            )
            .join(''),
      );
    }
  const notify = () => {
    if (overlay.props.onChanged)
      runtime.action(overlay.props.onChanged, selectedColor(overlay.color));
  };
  const paint = () => {
    for (const b of palette.children)
      b.setAttribute('aria-pressed', String(b.dataset.color === overlay.color.hex));
    preview.style.backgroundColor = overlay.color.hex;
    preview.style.opacity = overlay.color.alpha / 255;
    hexInput.value = overlay.color.hex.slice(1).toUpperCase();
    opacityLabel.textContent = `Opacity ${Math.round((overlay.color.alpha / 255) * 100)}%`;
  };
  for (const hex of swatches) {
    const b = node('button', 'color-swatch');
    b.type = 'button';
    b.style.backgroundColor = hex;
    b.dataset.color = hex;
    b.setAttribute('aria-label', `Color ${hex}`);
    b.onclick = () => {
      overlay.color.hex = hex;
      paint();
      notify();
    };
    palette.append(b);
  }
  const selected = node('div', 'color-selection'),
    preview = node('span', 'color-selected');
  preview.setAttribute('aria-hidden', 'true');
  const label = node('label', 'color-hex-label', 'Hex color #'),
    hexInput = node('input', 'color-hex');
  hexInput.type = 'text';
  hexInput.maxLength = 6;
  hexInput.pattern = '[0-9a-fA-F]{6}';
  hexInput.setAttribute('aria-label', 'Hex color');
  hexInput.onchange = () => {
    if (/^[\da-f]{6}$/i.test(hexInput.value)) {
      overlay.color.hex = '#' + hexInput.value.toLowerCase();
      paint();
      notify();
    } else paint();
  };
  label.append(hexInput);
  selected.append(preview, label);
  const opacityLabel = node('label', 'color-opacity'),
    alpha = node('input', 'native-alpha-input');
  alpha.type = 'range';
  alpha.min = '0';
  alpha.max = '255';
  alpha.value = String(overlay.color.alpha);
  alpha.setAttribute('aria-label', 'Opacity');
  alpha.oninput = () => {
    overlay.color.alpha = Number(alpha.value);
    paint();
  };
  alpha.onchange = notify;
  root.append(palette, selected);
  if (overlay.props.supportsAlpha !== false) root.append(opacityLabel, alpha);
  paint();
  return root;
}
