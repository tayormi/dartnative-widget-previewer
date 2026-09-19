import { color } from './style-values.js';
import { durationMilliseconds } from './preview-controllers.js';

export const shimmerCSS = `@keyframes dn-shimmer{from{background-position:100% 0}to{background-position:0 0}}.dn-shimmer-surface{background-size:400% 100%!important;animation-name:dn-shimmer;animation-timing-function:linear}@media(prefers-reduced-motion:reduce){.dn-shimmer-surface{animation:none!important}}`;
export function mountShimmer(el, p, child) {
  el.append(child);
  if (p.enabled === false) return;
  const base = color(p.baseColor),
    highlight = color(p.highlightColor),
    period = durationMilliseconds(p.period ?? { props: { milliseconds: 1500 } }),
    loops = p.loop ?? 0;
  if (
    !base ||
    !highlight ||
    !Number.isFinite(period) ||
    period <= 0 ||
    !Number.isInteger(loops) ||
    loops < 0
  )
    throw Error('Shimmer needs colors, a positive period and a nonnegative loop count.');
  const narrow = p.style?.symbol === 'ShimmerStyle.narrow',
    gradient = `linear-gradient(90deg,${base} 0%,${base} ${narrow ? 35 : 15}%,${highlight} 50%,${base} ${narrow ? 65 : 85}%,${base} 100%)`;
  if (!child.textContent && !child.children.length) {
    el.style.width = '100%';
    el.style.height = '100%';
    child.style.width ||= '100%';
    child.style.height ||= '100%';
  }
  // Keep each painted child's shape, radius and text glyphs. CSS approximates
  // the native gradient layer; it does not turn a complex child into a block.
  for (const surface of [child, ...child.querySelectorAll('.dn')]) {
    const text = surface.classList.contains('dn-Text');
    if (!text && !surface.style.background && !surface.style.backgroundColor) continue;
    surface.classList.add('dn-shimmer-surface');
    surface.style.backgroundImage = gradient;
    surface.style.animationDuration = `${period}ms`;
    surface.style.animationIterationCount = loops === 0 ? 'infinite' : String(loops);
    if (text) {
      surface.style.backgroundClip = 'text';
      surface.style.webkitBackgroundClip = 'text';
      surface.style.color = 'transparent';
    }
  }
}
