import { color } from './style-values.js';

export function badgeLabel(props) {
  return props.count != null
    ? props.count > 99
      ? '99+'
      : String(props.count)
    : (props.label ?? null);
}

export function mountBadge(el, props, child) {
  Object.assign(el.style, {
    position: 'relative',
    display: 'inline-flex',
    width: 'max-content',
    maxWidth: '100%',
    overflow: 'visible',
    verticalAlign: 'middle',
  });
  el.append(child);
  const label = badgeLabel(props);
  if (label === null) return;
  const badge = document.createElement('span');
  badge.className = 'native-badge';
  badge.textContent = label;
  const size = props.isLarge ? 22 : 18;
  Object.assign(badge.style, {
    position: 'absolute',
    top: '0',
    right: '0',
    transform: 'translate(50%,-35%)',
    minWidth: `${size}px`,
    height: `${size}px`,
    padding: '0 5px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    background: color(props.badgeColor) || '#ff3b30',
    color: color(props.labelColor) || '#fff',
    fontSize: props.isLarge ? '14px' : '12px',
    fontWeight: '500',
    lineHeight: '1',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: '1',
  });
  el.append(badge);
}
