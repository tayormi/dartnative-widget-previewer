// Source-backed defaults where the SDK documents them; browser approximations elsewhere.
export const platforms = {
  ios: {
    label: 'iOS 26',
    font: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    accent: '#007aff',
    barHeight: 52,
    bodySize: 17,
  },
  android: {
    label: 'Android · Material 3',
    font: 'Roboto, "Noto Sans", Arial, sans-serif',
    accent: '#6750a4',
    barHeight: 54,
    bodySize: 16,
  },
};
export const symbolName = (value) => value?.symbol?.split('.').at(-1) ?? value;
export function buttonVariant(props, widget, platform) {
  const variant = symbolName(props.variant);
  if (variant) {
    if (platform === 'android') {
      if (variant === 'glass' || variant === 'prominentGlass') return 'tinted';
      if (variant === 'clearGlass' || variant === 'prominentClearGlass') return 'plain';
    }
    return variant;
  }
  if (widget === 'IconButton' || widget === 'TextButton') return 'plain';
  if (widget === 'OutlinedButton') return 'bordered';
  if (['ElevatedButton', 'FilledButton'].includes(widget)) return 'filled';
  return 'filled';
}
const paths = {
  chat_bubble_2:
    'M4 3h11a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-5 4v-4a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM18 8h2a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3v3l-5-3h-4a3 3 0 0 1-3-3',
  list_bullet: 'M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13',
  music_note:
    'M10 18V4l11-2v14M10 7l11-2M10 18c0 2-2 4-5 4s-4-2-3-4 5-3 8-2M21 16c0 2-2 4-5 4s-4-2-3-4 5-3 8-2',
  info_circle: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 11v6m0-10v.1',
  camera_fill: 'M3 6h4l2-3h6l2 3h4v15H3ZM17 13a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  camera_rotate:
    'M3 7h4l2-3h6l2 3h4v14H3ZM8 13a4 4 0 0 1 7-2l1 2m0-3v3h-3M16 16a4 4 0 0 1-7 2l-1-2m0 3v-3h3',
  circle_grid_hex_fill:
    'M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM21 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM21 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM14 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  textformat_size: 'M2 9h8M6 9v12m-3 0h6M10 3h12m-6 0v18m-4 0h8',
  person_crop_circle_fill:
    'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0M5 19v-1a7 6 0 0 1 14 0v1',
  play_arrow: 'M7 3v18l14-9Z',
  pause: 'M6 4h4v16H6ZM14 4h4v16h-4Z',
  fast_rewind: 'M11 5 2 12l9 7ZM22 5l-9 7 9 7Z',
  fast_forward: 'm2 5 9 7-9 7Zm11 0 9 7-9 7Z',
  fullscreen: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6',
  fullscreen_exit: 'M3 9h6V3m6 0v6h6m0 6h-6v6m-6 0v-6H3',
  play_rectangle_fill:
    'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm6 4v8l6-4Z',
  slider_horizontal_3:
    'M2 5h5m4 0h11M2 12h11m4 0h5M2 19h3m4 0h13M7 3v4h4V3ZM13 10v4h4v-4ZM5 17v4h4v-4Z',
  star: 'm12 2 3 6.2 6.8 1-4.9 4.8 1.2 6.8-6.1-3.2-6.1 3.2 1.2-6.8L2.2 9.2l6.8-1Z',
  add: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  check: 'm5 12 4 4L19 6',
  arrow_forward: 'M4 12h16m-6-6 6 6-6 6',
  arrow_back: 'M20 12H4m6-6-6 6 6 6',
  chevron_right: 'm9 5 7 7-7 7',
  chevron_left: 'm15 5-7 7 7 7',
  search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  home: 'm3 10 9-7 9 7v11h-6v-7H9v7H3Z',
  book: 'M3 4h6q3 0 3 3v14q0-3-3-3H3Zm18 0h-6q-3 0-3 3v14q0-3 3-3h6Z',
  menu_book:
    'M12 6c-3-2-7-2-10-1v15c3-1 7-1 10 1m0-15c3-2 7-2 10-1v15c-3-1-7-1-10 1V6m3 2h4m-4 3h4m-4 3h4',
  auto_stories: 'M12 8c-3-2-7-2-10-1v14c3-1 7-1 10 1m0-14v14c3-2 7-2 10-1V7m-7-3 5-2v14l-5 2V4Z',
  water_drop: 'M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Zm-3 14q0 3 3 3',
  person: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 22v-2a8 8 0 0 1 16 0v2',
  favorite: 'M12 21 3 12C-3 4 7-1 12 6c5-7 15-2 9 6Z',
  favorite_border: 'M12 21 3 12C-3 4 7-1 12 6c5-7 15-2 9 6Z',
  edit: 'm4 16 12-12 4 4L8 20H4Zm10-10 4 4',
  notifications: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3h4',
  settings:
    'm10 2-.7 3-2 .9L4.7 5 2 9l2.2 2v2L2 15l2.7 4 2.6-.9 2 .9.7 3h4l.7-3 2-.9 2.6.9 2.7-4-2.2-2v-2L22 9l-2.7-4-2.6.9-2-.9L14 2ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  check_circle: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M7 12l3 3 7-7',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7Z',
  bolt_slash: 'm13 2-3 7m-3 3-3 2h7l-1 8 5-6m2-3 3-4h-7l.4-5M3 3l18 18',
  bolt_badge_a: 'm11 2-9 12h7l-1 8 6-9m0-4h-3V2M16 20l3-9 3 9m-5-3h4',
  more_horiz: 'M4 12h.01M12 12h.01M20 12h.01',
  local_fire_department: 'M13 2c1 7 7 6 7 13a8 8 0 0 1-16 0c0-4 3-7 5-9 0 4 2 5 2 5s3-4 2-9Z',
  restaurant: 'M4 2v7m3-7v7M10 2v7q0 3-3 3v10M4 9q0 3 3 3M20 2v20m0-20q-6 3-6 11h6',
  sunny:
    'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M20 4l-2 2M6 18l-2 2',
  moon: 'M21 14a9 9 0 0 1-11-11 9 9 0 1 0 11 11Z',
  checkmark_seal_fill:
    'm12 2 3 2 4 .5.5 4L22 12l-2.5 3.5-.5 4-4 .5-3 2-3-2-4-.5-.5-4L2 12l2.5-3.5.5-4L9 4ZM7 12l3 3 7-7',
  arrow_up: 'M12 20V4m-6 6 6-6 6 6',
  tray_full: 'M3 9h18v12H3ZM3 13h5l2 3h4l2-3h5M6 6h12M8 3h8',
};
const aliases = {
  play_fill: 'play_arrow',
  pause_fill: 'pause',
  bolt_fill: 'bolt',
  sun_max: 'sunny',
  sun_max_fill: 'sunny',
  light_max: 'sunny',
  xmark: 'close',
  plus: 'add',
  checkmark: 'check',
  tray_full_fill: 'tray_full',
  chevron_down: 'chevron_right',
  chevron_back: 'chevron_left',
};
export function iconSvg(name, platform = 'ios') {
  const path = paths[aliases[name] || name];
  if (!path) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute(
    'fill',
    ['play_arrow', 'play_fill', 'pause', 'pause_fill', 'fast_rewind', 'fast_forward'].includes(name)
      ? 'currentColor'
      : 'none',
  );
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', platform === 'ios' ? '1.8' : '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (name === 'chevron_down') svg.style.transform = 'rotate(90deg)';
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}
