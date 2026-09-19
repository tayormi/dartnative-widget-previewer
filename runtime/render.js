import { mountMap } from './map-view.js';
import { mountVirtualViewport } from './virtual-viewport.js';
import { appendLargeTitle } from './preview-app-bars.js';
import { markImplicit } from './preview-implicit.js';
import { mountGlass, markGlassGroup } from './preview-glass.js';
import { mountBadge } from './preview-badge.js';
import { mountCanvas } from './preview-canvas.js';
import { color, boxShadows, borderStyles } from './style-values.js';
import { mountImage } from './image-view.js';
import { mountLottie } from './lottie-view.js';
import { mountVideo } from './video-view.js';
import { mountCamera } from './camera-view.js';
import { mountShimmer, shimmerCSS } from './shimmer-view.js';
import {
  dimension,
  insets,
  borderRadius,
  axisAlignment,
  placeAlignment,
  constraintsStyle,
  gradientCSS,
  applyTextStyle,
} from './layout-values.js';
import { renderControl, renderOverlays } from './native-controls.js';
export { color } from './style-values.js';
import { platforms, buttonVariant, iconSvg } from './platform.js';
import { materialSymbolsRounded } from './material-symbols-rounded.js';
import { attachScrollView } from './scroll-adapter.js';
const symbol = (x) => x?.symbol?.split('.').at(-1) ?? x;
const textStyle = applyTextStyle;
export function syncDeviceChrome(device, tree, runtime) {
  const iosTabs = device?.dataset.platform === 'ios' && tree?.props?.bottomNavigationBar;
  device?.style.setProperty(
    '--screen-background',
    color(tree?.props?.backgroundColor) || 'var(--native-background)',
  );
  if (device)
    device.dataset.extendsSafeArea = String(
      !!(tree?.props?.extendBodyBehindAppBar || tree?.props?.extendBody || iosTabs),
    );
  const dark =
    symbol(
      tree?.props?.brightness ??
        runtime?.systemUIStyle?.props?.statusBarBrightness ??
        runtime?.brightness,
    ) === 'dark';
  if (device) {
    device.dataset.brightness = dark ? 'dark' : 'light';
    device.style.setProperty('--native-ink', dark ? '#fff' : '#000');
    const status = device.querySelector('.device-status');
    if (status) {
      status.style.color = dark ? '#fff' : '#000';
      status.style.background = color(runtime?.systemUIStyle?.props?.statusBarColor) || '';
    }
    const home = device.querySelector('.home-indicator');
    if (home)
      home.style.background = iosTabs
        ? 'transparent'
        : color(runtime?.systemUIStyle?.props?.systemNavigationBarColor) || '';
  }
}
export function renderTree(
  tree,
  {
    runtime,
    mode,
    selected,
    onSelect,
    onFault,
    platform = 'ios',
    resolveAsset = () => null,
    componentDefinition = null,
    device = null,
  },
) {
  syncDeviceChrome(device, tree, runtime);
  runtime.fileAudio?.bindAssets(resolveAsset);
  let budget = 0;
  const mapViews = new Set(),
    imageViews = new Set(),
    lottieViews = new Set(),
    videoViews = new Set(),
    gestureViews = new Set(),
    canvasViews = new Set(),
    cameraViews = new Set();
  let usesShimmer = false;
  function render(v, instance = null, safe = {}) {
    const boundedHeight = !safe.unboundedHeight;
    if (++budget > 5000) throw Error('Preview node limit reached.');
    const instanceId = `w${budget}`;
    if (v == null) return document.createDocumentFragment();
    if (Array.isArray(v)) throw Error('Expected a widget, but received a nested list of widgets.');
    if (!v.widget) {
      const e = document.createElement('span');
      e.textContent = String(v);
      return e;
    }
    if (v.componentNode)
      instance = v.componentNode.name === componentDefinition ? null : instance || v.componentNode;
    const selectedNode = instance || v.node;
    const p = v.props ?? {},
      a = v.args ?? [],
      name = v.widget;
    // Tight constraints come from an explicit parent size or both Positioned
    // edges. Carry them through wrappers, then consume them at layout widgets.
    const tightWidth = safe.tightWidth === true,
      tightHeight = safe.tightHeight === true;
    const transparent = [
      'Padding',
      'GestureDetector',
      'InkWell',
      'Opacity',
      'IgnorePointer',
      'ClipRRect',
      'ClipOval',
      'Hero',
      'Transform.translate',
      'Visibility',
      'ColoredBox',
      'GlassEffectContainer',
      'GlassEffectGroup',
    ];
    safe = {
      ...safe,
      tightWidth: transparent.includes(name) && tightWidth,
      tightHeight: transparent.includes(name) && tightHeight,
    };
    let el = document.createElement('div');
    el.className = `dn dn-${name.replaceAll('.', '-')}`;
    const add = (x) => {
      try {
        el.append(render(x, instance, safe));
      } catch (e) {
        el.append(
          render({
            widget: 'Unsupported',
            name: e.message,
            props: {},
            args: [],
            node: x?.node,
          }),
        );
        onFault?.(e.message);
      }
    };
    const child = () => add(p.child);
    const children = () => {
      for (const x of p.children ?? []) add(x);
    };
    const click = (fn) =>
      el.addEventListener('click', (e) => {
        if (mode === 'interact') {
          e.stopPropagation();
          runtime.action(fn);
        }
      });
    const change = (fn, value) => runtime.action(fn, value);
    switch (name) {
      case 'Directionality':
        el.dir = symbol(p.textDirection) || 'ltr';
        el.style.display = 'contents';
        child();
        break;
      case 'DNPreviewScope':
        el.lang = p.locale || 'en';
        el.style.display = 'contents';
        child();
        break;
      case 'DefaultTextStyle':
        el.style.display = 'contents';
        textStyle(el, p.style);
        child();
        break;
      case 'GoogleMaps':
      case 'GoogleMapsView':
        mountMap(el, v.mapKey, p, { runtime, mode, views: mapViews });
        break;
      case 'CameraPreview':
        mountCamera(el, `${v.node?.file}:${v.node?.start}:${instanceId}`, p, {
          runtime,
          mode,
          views: cameraViews,
        });
        break;
      case 'ValueListenableBuilder':
        return render(p.child, instance);
      case 'FutureBuilder':
        return render(p.child, instance, safe);
      case 'CustomPaint':
        mountCanvas(el, v, runtime, canvasViews, () => render(p.child, instance, safe));
        break;
      case 'Scaffold': {
        const scrollingTabs =
          platform === 'ios' &&
          p.bottomNavigationBar?.props?.scrollBehavior &&
          symbol(p.bottomNavigationBar.props.scrollBehavior) !== 'none';
        const extendBody = p.extendBody || scrollingTabs;
        el.classList.add('screen');
        el.dataset.resizeToAvoidBottomInset = String(p.resizeToAvoidBottomInset !== false);
        el.style.width = '100%';
        el.style.minHeight = '0';
        el.style.background = color(p.backgroundColor) ?? 'var(--native-background)';
        if (symbol(p.brightness) === 'dark') {
          el.style.setProperty('--native-background', '#000');
          el.style.setProperty('--native-ink', '#fff');
          el.style.setProperty('--native-field', '#1c1c1e');
        }
        if (p.appBar) add(p.appBar);
        const body = document.createElement('div');
        body.className = 'screen-body';
        if (p.extendBodyBehindAppBar) {
          el.style.position = 'relative';
          if (p.appBar) {
            const bar = el.firstElementChild;
            bar.style.position = 'absolute';
            bar.style.inset = '0 0 auto';
          }
          // The preview viewport begins below the status bar. Extended native
          // content begins at the physical screen top and supplies its own inset.
          body.style.marginTop = 'calc(-1 * var(--preview-safe-top,62px))';
        }
        if (extendBody) body.style.marginBottom = 'calc(-1 * var(--preview-safe-bottom,34px))';
        body.append(
          render(p.body, instance, {
            top: p.extendBodyBehindAppBar ? 'var(--preview-safe-top,62px)' : 0,
            bottom: extendBody ? 'var(--preview-safe-bottom,34px)' : 0,
          }),
        );
        if (p.extendBodyBehindAppBar) {
          const primary = body.querySelector('[data-scroll-axis="vertical"]');
          if (primary?.dataset.autoInsets === 'true')
            primary.style.paddingTop = `calc(var(--preview-safe-top,62px) + ${p.appBar ? (p.appBar.props.toolbarHeight ?? platforms[platform].barHeight) : 0}px)`;
        }
        el.append(body);
        if (p.bottomNavigationBar) add(p.bottomNavigationBar);
        if (p.bottomInputBar) add(p.bottomInputBar);
        if (extendBody) {
          el.style.position = 'relative';
          for (const bar of [...el.children].filter(
            (c) => c !== body && c.dataset.widget !== 'AppBar',
          )) {
            bar.style.position = 'absolute';
            bar.style.inset = 'auto 0 0';
            bar.style.zIndex = '3';
          }
        }
        break;
      }
      case 'AppBar': {
        el.classList.add('app-bar');
        el.style.height = `${p.toolbarHeight ?? platforms[platform].barHeight}px`;
        el.style.minHeight = el.style.height;
        if (p.backgroundColor) el.style.background = color(p.backgroundColor);
        const leading = document.createElement('div');
        leading.className = 'nav-leading';
        const title = document.createElement('div');
        title.className = 'nav-title';
        const actions = document.createElement('div');
        actions.className = 'nav-actions';
        if (runtime.stack.length && !p.leading && p.automaticallyImplyLeading !== false) {
          const back = document.createElement('button');
          back.setAttribute('aria-label', 'Back');
          back.append(iconSvg(platform === 'ios' ? 'chevron_left' : 'arrow_back', platform));
          // showBackTitle opts into the preceding native navigation item's title.
          // Our supported PageRoute does not supply that metadata; do not invent "Back".
          back.className = 'back';
          back.onclick = () => {
            if (mode === 'interact') runtime.back();
          };
          leading.append(back);
        }
        if (p.leading) leading.append(render(p.leading, instance));
        title.append(render(p.title, instance));
        // UIKit styles a plain navigation title, not every Text in a custom title view.
        if (p.title?.widget !== 'Text') title.style.fontWeight = '400';
        if (p.subtitle) title.append(render(p.subtitle, instance));
        for (const x of p.actions ?? []) actions.append(render(x, instance));
        if (p.actionsGlassBackground === false)
          for (const button of actions.querySelectorAll('button')) {
            button.style.background = 'transparent';
            button.style.boxShadow = 'none';
            button.style.backdropFilter = 'none';
          }
        if (p.titleGlassBackground) {
          title.style.background = '#ffffff80';
          title.style.backdropFilter = 'blur(16px)';
          title.style.borderRadius = '22px';
          title.style.padding = '8px 12px';
        }
        el.append(leading, title, actions);
        if (p.titleSpacing != null) title.style.marginInline = `${p.titleSpacing}px`;
        if (p.actionsPadding) actions.style.padding = insets(p.actionsPadding);
        if (p.searchBar) {
          el.classList.add('has-search');
          title.replaceWith(render(p.searchBar, instance));
          el.style.gridTemplateColumns = 'auto minmax(0,1fr) auto';
          el.style.columnGap = '8px';
        }
        if (p.centerTitle != null) el.dataset.centerTitle = String(p.centerTitle);
        if (p.centerTitle === false) {
          el.style.gridTemplateColumns = 'auto minmax(0,1fr) auto';
          if (!p.searchBar && !leading.childNodes.length) {
            leading.style.display = 'none';
            el.style.gridTemplateColumns = 'minmax(0,1fr) auto';
          }
        }
        if (p.largeTitle) {
          if (platform !== 'ios')
            onFault?.('Android large-title layout needs another browser adapter.');
          appendLargeTitle(el, p, (x) => render(x, instance));
        }
        break;
      }
      case 'Text':
        el = document.createElement('span');
        el.className = 'dn dn-Text';
        el.textContent = a[0] == null ? '' : String(a[0]);
        textStyle(el, p.style);
        el.style.textAlign = symbol(p.textAlign) ?? '';
        el.style.direction = symbol(p.textDirection) ?? '';
        el.style.whiteSpace = p.softWrap === false ? 'pre' : 'pre-wrap';
        el.style.overflowWrap = p.softWrap === false ? 'normal' : 'anywhere';
        el.style.userSelect = p.selectable ? 'text' : '';
        if (p.maxLines) {
          el.style.display = '-webkit-box';
          el.style.webkitLineClamp = p.maxLines;
          el.style.webkitBoxOrient = 'vertical';
          el.style.overflow = 'hidden';
          if (p.maxLines === 1) {
            el.style.display = 'block';
            el.style.whiteSpace = 'pre';
            el.style.textOverflow = symbol(p.overflow) === 'ellipsis' ? 'ellipsis' : 'clip';
          }
        }
        if (symbol(p.overflow) === 'visible') {
          el.style.overflow = 'visible';
          el.style.webkitLineClamp = 'unset';
        }
        break;
      case 'RichText':
        el.style.textAlign = symbol(p.textAlign) || '';
        if (p.maxLines) {
          el.style.display = '-webkit-box';
          el.style.webkitLineClamp = p.maxLines;
          el.style.webkitBoxOrient = 'vertical';
          el.style.overflow = 'hidden';
        }
        if (symbol(p.overflow) === 'visible') el.style.overflow = 'visible';
        add(p.text);
        break;
      case 'TextSpan':
        if (p.text) el.append(document.createTextNode(p.text));
        children();
        textStyle(el, p.style);
        break;
      case 'Column':
      case 'Row':
      case 'Wrap': {
        el.style.display = 'flex';
        const vertical =
          name === 'Column' || (name === 'Wrap' && symbol(p.direction) === 'vertical');
        el.style.flexDirection =
          (vertical ? 'column' : 'row') +
          (symbol(p.verticalDirection) === 'up' && vertical ? '-reverse' : '');
        el.style.flexWrap = name === 'Wrap' ? 'wrap' : 'nowrap';
        if (name === 'Row' && symbol(p.mainAxisSize) !== 'min') el.style.alignSelf = 'stretch';
        el.style.gap = `${p.spacing ?? 0}px`;
        if (name === 'Wrap') {
          el.style.rowGap = `${(vertical ? p.spacing : p.runSpacing) ?? 0}px`;
          el.style.columnGap = `${(vertical ? p.runSpacing : p.spacing) ?? 0}px`;
          el.style.alignContent = axisAlignment(p.runAlignment);
        }
        el.style.alignItems =
          {
            start: 'flex-start',
            end: 'flex-end',
            center: 'center',
            stretch: 'stretch',
            baseline: 'baseline',
          }[symbol(p.crossAxisAlignment)] ?? (name === 'Wrap' ? 'flex-start' : 'center');
        el.style.justifyContent =
          {
            start: 'flex-start',
            end: 'flex-end',
            center: 'center',
            spaceBetween: 'space-between',
            spaceAround: 'space-around',
            spaceEvenly: 'space-evenly',
          }[symbol(name === 'Wrap' ? p.alignment : p.mainAxisAlignment)] ?? 'flex-start';
        if (name === 'Column' && symbol(p.mainAxisSize) !== 'min')
          el.style.minHeight = boundedHeight ? '100%' : '0';
        children();
        if (name === 'Column')
          for (const c of el.children)
            if (c.dataset.expandWidth === 'true') c.style.alignSelf = 'stretch';
        break;
      }
      case 'Container':
      case 'AnimatedContainer':
      case 'Card':
      case 'ColoredBox': {
        safe = {
          ...safe,
          tightWidth: !p.alignment && (tightWidth || p.width != null),
          tightHeight: !p.alignment && (tightHeight || p.height != null),
          ...(Number.isFinite(p.height) ? { unboundedHeight: false } : {}),
        };
        const d = p.decoration?.props ?? {};
        Object.assign(el.style, {
          padding: insets(p.padding) ?? (name === 'Card' ? '12px' : ''),
          margin: insets(p.margin) ?? '',
          width: dimension(p.width),
          height: dimension(p.height),
          background: color(p.color ?? d.color) ?? (name === 'Card' ? '#fff' : ''),
          boxShadow: boxShadows(d.boxShadow),
          borderRadius:
            d.shape?.symbol === 'BoxShape.circle'
              ? '50%'
              : d.borderRadius
                ? borderRadius(d.borderRadius)
                : name === 'Card'
                  ? borderRadius(p.shape?.props?.borderRadius) || `${p.borderRadius ?? 12}px`
                  : '',
          ...borderStyles(d.border),
          ...constraintsStyle(p.constraints),
        });
        if (p.alignment) {
          const positions = {
            topLeft: ['start', 'start'],
            topCenter: ['start', 'center'],
            topRight: ['start', 'end'],
            centerLeft: ['center', 'start'],
            center: ['center', 'center'],
            centerRight: ['center', 'end'],
            bottomLeft: ['end', 'start'],
            bottomCenter: ['end', 'center'],
            bottomRight: ['end', 'end'],
          };
          const position = positions[symbol(p.alignment)];
          if (position) {
            el.style.display = 'grid';
            el.style.placeItems = position.join(' ');
          }
        }
        if (d.gradient?.valueType === 'LinearGradient') {
          const g = d.gradient.props;
          el.style.backgroundImage = gradientCSS(d.gradient);
        }
        child();
        if (name === 'AnimatedContainer') markImplicit(el, v.implicitKey, p);
        break;
      }
      case 'Padding':
        el.style.padding = insets(p.padding);
        child();
        break;
      case 'SizedBox':
        safe = {
          ...safe,
          tightWidth: !p.alignment && (tightWidth || p.width != null),
          tightHeight: !p.alignment && (tightHeight || p.height != null),
          ...(Number.isFinite(p.height) ? { unboundedHeight: false } : {}),
        };
        if (p.height != null) el.style.height = dimension(p.height);
        if (p.width != null) el.style.width = dimension(p.width);
        el.style.flexShrink = '0';
        child();
        break;
      case 'Center':
      case 'Align':
        el.style.display = 'grid';
        el.style.placeItems = placeAlignment(p.alignment);
        if (p.widthFactor === 1 && !tightWidth) {
          el.style.width = 'max-content';
          el.style.maxWidth = '100%';
        }
        if (p.heightFactor === 1 && !tightHeight) el.style.height = 'max-content';
        else el.style.minHeight = safe.unboundedHeight ? '0' : '100%';
        child();
        break;
      case 'Expanded':
      case 'Flexible':
        el.style.flex =
          name === 'Flexible' && symbol(p.fit) !== 'tight' ? `0 1 auto` : `${p.flex ?? 1} 1 0`;
        el.style.minWidth = '0';
        el.style.minHeight = '0';
        child();
        break;
      case 'Spacer':
        el.style.flex = `${p.flex ?? 1} 1 0`;
        break;
      case 'SafeArea':
        el.style.minHeight = '100%';
        if (!safe.unboundedHeight) el.style.height = '100%';
        {
          const remaining = { ...safe };
          for (const edge of ['top', 'bottom', 'left', 'right'])
            if (p[edge] !== false && safe[edge]) {
              el.style[`padding${edge[0].toUpperCase() + edge.slice(1)}`] = safe[edge];
              remaining[edge] = 0;
            }
          el.append(render(p.child, instance, remaining));
        }
        break;
      case 'ConstrainedBox':
        Object.assign(el.style, constraintsStyle(p.constraints));
        child();
        break;
      case 'FractionallySizedBox':
        el.style.display = 'grid';
        el.style.placeItems = placeAlignment(p.alignment);
        child();
        if (el.firstElementChild) {
          if (p.widthFactor != null) el.firstElementChild.style.width = `${p.widthFactor * 100}%`;
          if (p.heightFactor != null)
            el.firstElementChild.style.height = `${p.heightFactor * 100}%`;
        }
        break;
      case 'ListView':
      case 'SingleChildScrollView':
        safe = { ...safe, unboundedHeight: symbol(p.scrollDirection) !== 'horizontal' };
        el.style.overflow = 'auto';
        el.style.height = p.shrinkWrap ? 'auto' : '100%';
        el.style.padding = insets(p.padding) ?? '';
        el.dataset.autoInsets = String(p.padding == null);
        if (symbol(p.scrollDirection) !== 'horizontal') el.style.width = '100%';
        el.style.display = 'flex';
        el.style.position = 'relative';
        el.style.flexDirection = symbol(p.scrollDirection) === 'horizontal' ? 'row' : 'column';
        el.style.scrollbarWidth = p.showScrollBar ? 'auto' : 'none';
        if (p.children) {
          for (const [index, item] of [...p.children.entries()][
            p.reverse ? 'reverse' : 'slice'
          ]()) {
            add(item);
            el.lastElementChild.dataset.scrollIndex = index;
          }
        } else child();
        for (const c of el.children) {
          c.style.flexShrink = '0';
          if (p.itemExtent != null)
            c.style[symbol(p.scrollDirection) === 'horizontal' ? 'width' : 'height'] = dimension(
              p.itemExtent,
            );
        }
        attachScrollView(el, p, runtime, mode);
        break;
      case 'CustomScrollView': {
        safe = {
          ...safe,
          unboundedHeight: symbol(p.scrollDirection) !== 'horizontal',
          sliverReverse: !!p.reverse,
          sliverHorizontal: symbol(p.scrollDirection) === 'horizontal',
        };
        el.style.overflow = 'auto';
        el.style.height = p.shrinkWrap ? 'auto' : '100%';
        el.style.padding = insets(p.padding) || '';
        el.style.display = 'flex';
        el.style.position = 'relative';
        el.style.flexDirection = safe.sliverHorizontal ? 'row' : 'column';
        el.style.scrollbarWidth = p.showScrollBar ? 'auto' : 'none';
        for (const sliver of [...(p.slivers || [])][p.reverse ? 'reverse' : 'slice']()) add(sliver);
        for (const c of el.children) c.style.flexShrink = '0';
        attachScrollView(el, p, runtime, mode);
        break;
      }
      case 'SliverPadding':
        el.style.padding = insets(p.padding) || '';
        add(p.sliver);
        break;
      case 'SliverToBoxAdapter':
        child();
        break;
      case 'SliverList.builder':
      case 'SliverList.list': {
        el.style.display = 'flex';
        el.style.flexDirection = safe.sliverHorizontal ? 'row' : 'column';
        if (Number(p.itemCount ?? 0) > 500)
          onFault?.(`List preview capped at 500 of ${p.itemCount} rows.`);
        for (const [index, item] of [...(p.children || []).entries()][
          safe.sliverReverse ? 'reverse' : 'slice'
        ]()) {
          add(item);
          el.lastElementChild.dataset.scrollIndex = index;
          el.lastElementChild.style.flexShrink = '0';
        }
        break;
      }
      case 'FastList':
      case 'ListView.builder':
      case 'FastGrid':
      case 'MasonryFastGrid':
      case 'GridView.builder': {
        el.style.padding = insets(p.padding) || '';
        el.style.scrollbarWidth = p.showScrollBar ? 'auto' : 'none';
        const collection = runtime.virtualCollections.get(v.virtualKey);
        if (!collection) throw Error('Virtual collection is no longer mounted.');
        const childSafe = {
          ...safe,
          unboundedHeight:
            collection.kind === 'list' && !collection.settings.extent && !collection.horizontal,
        };
        mountVirtualViewport(
          el,
          collection,
          p.children || [],
          v.virtualIndices || [],
          (child) => render(child, instance, childSafe),
          runtime,
          mode,
        );
        attachScrollView(el, p, runtime, mode, collection);
        break;
      }
      case 'IndexedStack': {
        el.style.position = 'relative';
        el.style.height = safe.unboundedHeight ? 'auto' : '100%';
        el.style.width = '100%';
        el.style.minHeight = '0';
        el.style.display = 'grid';
        el.style.gridTemplateColumns = 'minmax(0,1fr)';
        el.style.gridTemplateRows = safe.unboundedHeight ? 'auto' : 'minmax(0,1fr)';
        const index = p.index ?? 0;
        for (let i = 0; i < (p.children || []).length; i++) {
          const slot = document.createElement('div');
          slot.style.gridArea = '1 / 1';
          slot.style.minHeight = '0';
          slot.style.minWidth = '0';
          slot.style.display = 'grid';
          slot.style.gridTemplateColumns = 'minmax(0,1fr)';
          slot.style.gridTemplateRows = safe.unboundedHeight ? 'auto' : 'minmax(0,1fr)';
          slot.style.placeItems = p.alignment ? placeAlignment(p.alignment) : 'start start';
          slot.style.visibility = i === index ? 'visible' : 'hidden';
          slot.style.pointerEvents = i === index ? '' : 'none';
          slot.setAttribute('aria-hidden', String(i !== index));
          slot.inert = i !== index;
          slot.append(render(p.children[i], instance, safe));
          el.append(slot);
        }
        break;
      }
      case 'GridView':
      case 'GridView.count': {
        const grid = name === 'GridView' ? p.gridDelegate?.props || {} : p;
        el.style.display = 'grid';
        el.style.gridTemplateColumns = `repeat(${grid.crossAxisCount ?? 2}, minmax(0,1fr))`;
        el.style.gap = `${grid.mainAxisSpacing ?? 0}px ${grid.crossAxisSpacing ?? 0}px`;
        el.style.padding = insets(p.padding) || '';
        el.style.overflow = 'auto';
        el.style.height =
          p.shrinkWrap || p.physics?.valueType === 'NeverScrollableScrollPhysics' ? 'auto' : '100%';
        el.style.alignContent = 'start';
        el.style.scrollbarWidth = p.showScrollBar ? 'auto' : 'none';
        children();
        for (const c of el.children) {
          if (grid.mainAxisExtent != null) c.style.height = dimension(grid.mainAxisExtent);
          else c.style.aspectRatio = String(grid.childAspectRatio ?? 1);
        }
        break;
      }
      case 'Icon':
        el = document.createElement('span');
        el.className = 'dn dn-Icon';
        el.setAttribute('aria-label', String(symbol(a[0])));
        {
          const codepoint =
            a[0]?.symbol?.startsWith('MaterialSymbolsRounded.') &&
            materialSymbolsRounded[symbol(a[0])];
          const svg = codepoint ? null : iconSvg(symbol(a[0]), platform);
          if (codepoint) {
            el.textContent = String.fromCodePoint(codepoint);
            el.classList.add('material-symbol');
            el.style.fontSize = `${p.size ?? 24}px`;
          } else if (svg) el.append(svg);
          else {
            el.textContent = '?';
            onFault?.(`Icon ${symbol(a[0])}: no preview vector.`);
          }
        }
        el.style.color = color(p.color) ?? '';
        el.style.width = el.style.height = `${p.size ?? 24}px`;
        break;
      case 'BarButtonItem':
      case 'FloatingActionButton':
      case 'Button':
      case 'ElevatedButton':
      case 'FilledButton':
      case 'TextButton':
      case 'OutlinedButton':
      case 'IconButton': {
        el = document.createElement('button');
        el.className = `dn dn-${name} preview-button`;
        el.dataset.variant = buttonVariant(p, name, platform);
        if (name === 'BarButtonItem') {
          el.dataset.variant = 'plain';
          textStyle(el, p.titleStyle);
          if (p.fontIcon) {
            el.setAttribute('aria-label', symbol(p.fontIcon));
            el.append(
              render(
                {
                  widget: 'Icon',
                  args: [p.fontIcon],
                  props: { size: 22, color: p.titleStyle?.props?.color },
                },
                instance,
              ),
            );
          }
        }
        if (name === 'FloatingActionButton') {
          const size = p.mini ? 40 : 56;
          el.style.width = el.style.height = `${size}px`;
          el.style.padding = '10px';
          el.style.borderRadius = '50%';
          el.style.background = color(p.backgroundColor) || 'var(--native-accent)';
        }
        if (name === 'Button' && platform === 'ios') {
          el.style.fontWeight = '400';
          if (p.variant != null) {
            el.style.padding = '7px 14px';
            el.style.minHeight = '34px';
          }
        }
        if (p.color) el.style.setProperty('--control-accent', color(p.color));
        if (p.color) el.style.backgroundColor = color(p.color);
        if (p.foregroundColor) el.style.color = color(p.foregroundColor);
        if (p.width != null) el.style.width = `${p.width}px`;
        if (p.height != null) el.style.height = `${p.height}px`;
        if (p.shape?.valueType === 'StadiumBorder') {
          el.style.borderRadius = '9999px';
          Object.assign(el.style, borderStyles(p.shape.props.side));
        }
        if (p.shape?.props?.borderRadius)
          el.style.borderRadius = `${p.shape.props.borderRadius.args?.[0] ?? 0}px`;
        if (p.padding) el.style.padding = insets(p.padding);
        if (p.fontSize) el.style.fontSize = `${p.fontSize}px`;
        if (p.fontWeight) el.style.fontWeight = String(symbol(p.fontWeight)).replace('w', '');
        if (p.child) el.append(render(p.child, instance));
        else if (p.icon) el.append(render(p.icon, instance));
        else if (!(name === 'BarButtonItem' && p.fontIcon))
          el.textContent = p.title ?? p.label ?? 'Button';
        if (p.imageAsset) {
          const icon = document.createElement('span');
          icon.setAttribute('aria-hidden', 'true');
          const size = p.imageSize;
          Object.assign(icon.style, { display: 'inline-block', flex: '0 0 auto' });
          const url = resolveAsset(p.imageAsset);
          if (url)
            mountImage(
              icon,
              url,
              { width: size, height: size, color: p.foregroundColor },
              {
                runtime,
                render: (x) => render(x, instance, safe),
                views: imageViews,
                local: true,
                intrinsic: true,
              },
            );
          else if (!p.imageAsset.includes('/'))
            icon.innerHTML = iconSvg(p.imageAsset, size ?? p.fontSize ?? 17, platform);
          else onFault?.(`Upload the image referenced by ${p.imageAsset}.`);
          const label = document.createElement('span');
          label.append(...el.childNodes);
          el.append(icon, label);
          el.style.display = 'inline-flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.gap = '8px';
        }
        if (name === 'IconButton')
          el.setAttribute('aria-label', p.tooltip ?? symbol(p.icon?.args?.[0]) ?? 'Action');
        el.disabled = mode === 'interact' && !p.onPressed;
        click(p.onPressed);
        break;
      }
      case 'Switch':
      case 'Checkbox': {
        el = document.createElement('input');
        el.className = `dn dn-${name}`;
        el.type = 'checkbox';
        el.checked = !!p.value;
        el.setAttribute('aria-label', name === 'Switch' ? 'Toggle setting' : 'Toggle checkbox');
        el.disabled = mode !== 'interact' || !p.onChanged;
        if (name === 'Checkbox' && p.activeColor)
          el.style.setProperty('--control-accent', color(p.activeColor));
        if (name === 'Switch') {
          const track = p.value
            ? p.activeTrackColor
            : platform === 'android'
              ? p.inactiveTrackColor
              : null;
          const thumb =
            platform === 'ios'
              ? p.inactiveThumbColor
              : p.value
                ? p.activeThumbColor
                : p.inactiveThumbColor;
          if (track) el.style.backgroundColor = color(track);
          if (thumb) el.style.setProperty('--switch-thumb', color(thumb));
        }
        el.onchange = (e) => change(p.onChanged, e.target.checked);
        break;
      }
      case 'TextField': {
        el = document.createElement(p.maxLines === null || p.maxLines > 1 ? 'textarea' : 'input');
        el.className = 'dn dn-TextField';
        el.dataset.filled = String(p.decoration?.props?.filled === true);
        if (el.tagName === 'INPUT') el.type = p.obscureText ? 'password' : 'text';
        el.placeholder = p.decoration?.props?.hintText ?? p.decoration?.props?.labelText ?? '';
        el.setAttribute(
          'aria-label',
          p.decoration?.props?.labelText ?? el.placeholder ?? 'Text input',
        );
        el.value = p.controller?.text ?? '';
        textStyle(el, p.style);
        const hintColor = color(p.decoration?.props?.hintStyle?.props?.color);
        if (hintColor) el.style.setProperty('--field-placeholder-color', hintColor);
        if (p.decoration?.props?.contentPadding)
          el.style.padding = insets(p.decoration.props.contentPadding);
        if (p.decoration?.props?.border?.symbol === 'InputBorder.none') {
          el.style.border = '0';
          el.style.background = 'transparent';
          el.style.borderRadius = '0';
        }
        if (p.decoration?.props?.filled)
          el.style.backgroundColor = color(p.decoration.props.fillColor) ?? 'var(--native-field)';
        el.readOnly = mode !== 'interact' || p.readOnly === true;
        el.disabled = p.enabled === false;
        if (p.maxLength != null) el.maxLength = p.maxLength;
        if (el.tagName === 'TEXTAREA') el.rows = p.minLines ?? 1;
        const grow = () => {
          if (el.tagName !== 'TEXTAREA' || !el.isConnected) return;
          const css = getComputedStyle(el),
            line = parseFloat(css.lineHeight),
            padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom),
            border = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
          el.style.resize = 'none';
          el.style.height = 'auto';
          const height = Math.max(
            line * (p.minLines ?? 1) + padding + border,
            Math.min(
              el.scrollHeight + border,
              p.maxLines ? line * p.maxLines + padding + border : Infinity,
            ),
          );
          el.style.height = `${height}px`;
        };
        if (el.tagName === 'TEXTAREA') queueMicrotask(grow);
        el.style.textAlign = symbol(p.textAlign) || '';
        if (p.cursorColor) el.style.caretColor = color(p.cursorColor);
        el.inputMode =
          { number: 'decimal', phone: 'tel', emailAddress: 'email', url: 'url' }[
            symbol(p.keyboardType)
          ] || 'text';
        if (p.textCapitalization)
          el.setAttribute(
            'autocapitalize',
            { none: 'off', characters: 'characters', words: 'words', sentences: 'sentences' }[
              symbol(p.textCapitalization)
            ] || 'off',
          );
        el.enterKeyHint = symbol(p.textInputAction) || '';
        el.setAttribute('autocorrect', p.autocorrect === false ? 'off' : 'on');
        if (p.autofocus && mode === 'interact')
          queueMicrotask(() => {
            if (el.isConnected && !runtime.disposed && document.activeElement === document.body)
              el.focus();
          });
        el.onkeydown = (e) => {
          if (e.key === 'Enter' && el.tagName === 'INPUT' && mode === 'interact') {
            if (p.onSubmitted) change(p.onSubmitted, el.value);
            if (p.onEditingComplete) runtime.action(p.onEditingComplete);
          }
        };
        el.onclick = () => {
          if (mode === 'interact' && p.onTap) runtime.action(p.onTap);
        };
        el.oninput = (e) => {
          grow();
          if (p.controller) p.controller.text = e.target.value;
          if (p.onChanged) change(p.onChanged, e.target.value);
        };
        break;
      }
      case 'ListTile': {
        el.classList.add('list-tile');
        if (p.tileColor) el.style.backgroundColor = color(p.tileColor);
        if (p.contentPadding) el.style.padding = insets(p.contentPadding);
        if (p.leading) add(p.leading);
        const text = document.createElement('div');
        text.className = 'tile-text';
        if (p.title) text.append(render(p.title, instance));
        if (p.subtitle) {
          const sub = document.createElement('div');
          sub.className = 'tile-subtitle';
          sub.append(render(p.subtitle, instance));
          text.append(sub);
        }
        el.append(text);
        if (p.trailing) add(p.trailing);
        if (p.onTap) click(p.onTap);
        break;
      }
      case 'GestureDetector':
        // DartNative attaches the recognizer to the child's native view. Its
        // external margin is outside the view-local coordinate space.
        child();
        gestureViews.add(v.gestureKey);
        runtime.gestures.mount(el.firstElementChild || el, v.gestureKey, p, mode);
        break;
      case 'InkWell':
        child();
        if (p.onTap) {
          el.style.cursor = 'pointer';
          click(p.onTap);
        }
        break;
      case 'BackButton':
        el = document.createElement('button');
        el.className = 'dn back';
        el.type = 'button';
        el.setAttribute('aria-label', p.title || 'Back');
        el.style.color = color(p.iconColor) || 'inherit';
        if (p.padding) el.style.padding = insets(p.padding);
        el.append(
          iconSvg(symbol(p.icon) || (platform === 'ios' ? 'chevron_left' : 'arrow_back'), platform),
        );
        if (p.iconSize)
          el.firstElementChild.style.width = el.firstElementChild.style.height = `${p.iconSize}px`;
        if (p.title) {
          const label = document.createElement('span');
          label.textContent = p.title;
          textStyle(label, p.titleStyle);
          el.append(label);
        }
        el.onclick = (e) => {
          if (mode === 'interact') {
            e.stopPropagation();
            p.onTap ? runtime.action(p.onTap) : runtime.back();
          }
        };
        break;
      case 'Divider':
        el.style.borderTop = `${p.thickness ?? 1}px solid ${color(p.color) ?? '#e5e5e7'}`;
        el.style.margin = `${Math.max(0, ((p.height ?? 16) - (p.thickness ?? 1)) / 2)}px ${p.endIndent ?? 0}px ${Math.max(0, ((p.height ?? 16) - (p.thickness ?? 1)) / 2)}px ${p.indent ?? 0}px`;
        break;
      case 'Visibility':
        if (p.visible !== false) child();
        else if (p.replacement) add(p.replacement);
        break;
      case 'Opacity':
        el.style.opacity = p.opacity;
        if (p.opacity === 0) el.setAttribute('aria-hidden', 'true');
        child();
        break;
      case 'IgnorePointer':
        if (p.ignoring !== false) {
          el.style.pointerEvents = 'none';
          el.inert = true;
        }
        child();
        break;
      case 'GlassEffectContainer':
        mountGlass(el, p, { platform, mode, child: render(p.child, instance, safe) });
        break;
      case 'GlassEffectGroup':
        child();
        if (platform === 'ios') markGlassGroup(el, p.spacing ?? 40);
        break;
      case 'Badge':
        mountBadge(el, p, render(p.child, instance, safe));
        break;
      case 'Stack':
        el.style.position = 'relative';
        el.style.display = 'grid';
        el.style.placeItems = placeAlignment(p.alignment ?? 'topLeft');
        el.style.overflow = symbol(p.clipBehavior) === 'none' ? 'visible' : 'hidden';
        children();
        if (el.children.length && [...el.children].every((c) => c.dataset.widget === 'Positioned'))
          el.style.height = '100%';
        for (const c of el.children)
          if (c.dataset.widget !== 'Positioned') {
            c.style.gridArea = '1 / 1';
            if (['Center', 'Align'].includes(c.dataset.widget)) {
              c.style.width = '100%';
              c.style.justifySelf = 'stretch';
            }
            if (symbol(p.fit) === 'expand') {
              c.style.width = '100%';
              c.style.height = '100%';
            }
          }
        break;
      case 'Positioned':
        // Positioning boxes do not own native hit tests; their controls do.
        el.style.pointerEvents = 'none';
        safe = {
          ...safe,
          tightWidth: p.width != null || (p.left != null && p.right != null),
          tightHeight: p.height != null || (p.top != null && p.bottom != null),
        };
        el.style.position = 'absolute';
        for (const side of ['top', 'left', 'right', 'bottom', 'width', 'height'])
          if (p[side] != null) el.style[side] = `${p[side]}px`;
        child();
        for (const target of el.querySelectorAll(
          'button,input,textarea,select,[role=button],[data-virtual-collection],.scrollable',
        ))
          target.style.pointerEvents = 'auto';
        break;
      case 'Hero':
        el.dataset.heroId = v.heroId;
        child();
        break;
      case 'Transform.translate':
        el.style.transform = `translate(${p.offset.args[0]}px,${p.offset.args[1]}px)`;
        child();
        break;
      case 'ClipOval':
        el.style.overflow = 'hidden';
        el.style.borderRadius = '50%';
        child();
        break;
      case 'ClipRRect':
        el.style.overflow = 'hidden';
        el.style.borderRadius = borderRadius(p.borderRadius) || '0';
        child();
        break;
      case 'BottomNavigationBar':
        el.classList.add('tab-bar');
        el.setAttribute('role', 'tablist');
        el.setAttribute('aria-label', 'App tabs');
        el.dataset.tabPlatform = platform;
        el.dataset.selectedTab = String(p.currentIndex ?? 0);
        if (p.scrollBehavior && symbol(p.scrollBehavior) !== 'none') {
          el.dataset.tabScrollBehavior = symbol(p.scrollBehavior);
          if (platform !== 'ios')
            onFault?.(
              'Scroll-minimizing tab bars currently support the iOS browser appearance only.',
            );
        }
        if (platform === 'ios')
          Object.assign(el.style, {
            width: `min(${(p.items?.length ?? 0) * 94}px,calc(100% - 40px))`,
            height: '62px',
            flexShrink: '0',
            alignSelf: 'center',
            margin: '5px auto -14px',
            padding: '3px',
            borderColor: '#88888830',
          });
        if (p.backgroundColor) el.style.backgroundColor = color(p.backgroundColor);
        if (p.indicatorColor) el.style.setProperty('--tab-indicator', color(p.indicatorColor));
        (p.items ?? []).forEach((item, i) => {
          const selected = i === (p.currentIndex ?? 0);
          const b = document.createElement('button');
          b.className = selected ? 'active' : '';
          b.disabled = item.props.enabled === false;
          b.setAttribute('role', 'tab');
          b.setAttribute('aria-selected', String(selected));
          b.dataset.tabLabel = item.props.label ?? `Tab ${i + 1}`;
          const rendered = render(
            selected && item.props.activeIcon
              ? { ...item, props: { ...item.props, icon: item.props.activeIcon } }
              : item,
            instance,
          );
          const labelStyle = selected
            ? (p.selectedLabelFontStyle ?? p.labelFontStyle)
            : p.labelFontStyle;
          const tint = selected
            ? (p.selectedIconColor ?? labelStyle?.props?.color)
            : (p.iconColor ?? labelStyle?.props?.color);
          if (tint)
            for (const icon of rendered.querySelectorAll('.dn-Icon'))
              icon.style.color = color(tint);
          for (const label of rendered.querySelectorAll('small')) {
            textStyle(label, labelStyle);
            if (platform === 'ios' && selected && p.selectedIconColor)
              label.style.color = color(p.selectedIconColor);
          }
          b.append(rendered);
          b.onclick = () => {
            if (mode === 'interact') change(p.onTap, i);
          };
          el.append(b);
        });
        break;
      case 'BottomNavigationBarItem':
        add(p.icon);
        if (p.label) {
          const label = document.createElement('small');
          label.textContent = p.label;
          el.append(label);
        }
        if (p.subtitle) {
          const sub = document.createElement('small');
          sub.textContent = p.subtitle;
          el.append(sub);
        }
        break;
      case 'Image':
      case 'Image.asset':
      case 'Image.file':
      case 'Image.network': {
        const provider = name === 'Image' ? p.image : null,
          imageName = provider
            ? { AssetImage: 'Image.asset', NetworkImage: 'Image.network' }[provider.valueType]
            : name,
          path = provider?.args?.[0] ?? a[0];
        if (!imageName) throw Error('Image needs a supported AssetImage or NetworkImage.');
        let url =
          imageName === 'Image.asset'
            ? resolveAsset(path)
            : imageName === 'Image.file'
              ? runtime.services.fileURL(path)
              : path;
        if (imageName === 'Image.network') {
          try {
            const parsed = new URL(url);
            if (!['https:', 'http:'].includes(parsed.protocol)) url = null;
          } catch {
            url = null;
          }
        }
        if (!url) {
          el.classList.add('image-placeholder');
          el.textContent = `Missing image · ${path ?? ''}`;
          el.style.height = `${p.height ?? 100}px`;
          onFault?.(`Upload the image referenced by ${path}.`);
          break;
        }
        const fit = symbol(p.fit) || 'contain';
        if (['fitWidth', 'fitHeight'].includes(fit))
          onFault?.(`BoxFit.${fit} is approximated in this browser preview.`);
        mountImage(el, url, p, {
          runtime,
          render: (x) => render(x, instance, safe),
          views: imageViews,
          local: imageName !== 'Image.network',
          bounded: !safe.unboundedHeight,
        });
        break;
      }
      case 'Shimmer.fromColors':
        usesShimmer = true;
        mountShimmer(el, p, render(p.child, instance, safe));
        break;
      case 'Lottie':
      case 'Lottie.network': {
        const source =
          name === 'Lottie.network' ? a[0] : (p.json ?? p.url ?? resolveAsset(p.asset));
        mountLottie(
          el,
          v.lottieKey ?? `${v.node?.file}:${v.node?.start}:${instanceId}`,
          source,
          p,
          {
            runtime,
            render: (x) => render(x, instance, safe),
            views: lottieViews,
            imageViews,
            local: p.asset != null,
            json: p.json != null,
            onFault,
          },
        );
        break;
      }
      case 'VideoPlayer':
      case 'VideoPlayerWithControls':
        mountVideo(el, v.videoKey, name, p, {
          runtime,
          mode,
          views: videoViews,
          resolveAsset,
          onFault,
        });
        break;
      default: {
        const control = renderControl({
          name,
          p,
          runtime,
          mode,
          platform,
          render: (x) => render(x, instance),
          key: `${v.node?.file}:${v.node?.start}:${instanceId}`,
        });
        if (control) {
          el = control;
          break;
        }
        el.classList.add('unsupported');
        el.textContent = v.name ?? `${name}: no browser adapter`;
        onFault?.(v.name ?? name);
      }
    }
    // Carry a child's demand for bounded width through Dart's layout wrappers.
    // CSS flex-start otherwise shrink-wraps a form or a full-width Row.
    const wrapper = [
      'Container',
      'AnimatedContainer',
      'Card',
      'ColoredBox',
      'Padding',
      'GestureDetector',
      'InkWell',
      'SafeArea',
      'SizedBox',
      'Column',
      'Expanded',
      'Flexible',
      'Hero',
      'ClipOval',
      'Transform.translate',
      'GlassEffectContainer',
      'GlassEffectGroup',
    ].includes(name);
    const expands =
      (name === 'Row' && symbol(p.mainAxisSize) !== 'min') ||
      ['TextField', 'SegmentedControl', 'VideoPlayer', 'VideoPlayerWithControls', 'Stack'].includes(
        name,
      ) ||
      ([
        'FastList',
        'FastGrid',
        'MasonryFastGrid',
        'ListView',
        'ListView.builder',
        'GridView.builder',
        'CustomScrollView',
      ].includes(name) &&
        symbol(p.scrollDirection) !== 'horizontal') ||
      (wrapper && [...el.children].some((c) => c.dataset.expandWidth === 'true'));
    if (
      p.width === Infinity ||
      (p.width == null && p.constraints?.props?.maxWidth == null && expands)
    ) {
      el.dataset.expandWidth = 'true';
      // Grid-backed alignment loosens constraints, but a max-size Row still
      // consumes the available width. alignSelf alone affects the other axis.
      el.style.justifySelf = 'stretch';
      el.style.minWidth = '0';
    }
    // Scrollable leaves need the available height, even through transparent
    // layout wrappers. Without this, CSS auto-height expands to all rows.
    const heightWrapper = [
      'Container',
      'AnimatedContainer',
      'ColoredBox',
      'Card',
      'Padding',
      'SafeArea',
      'SizedBox',
      'ClipRRect',
      'ClipOval',
      'Hero',
      'Transform.translate',
      'GestureDetector',
      'InkWell',
      'IgnorePointer',
      'Opacity',
      'GlassEffectContainer',
      'GlassEffectGroup',
    ].includes(name);
    const fillsHeight =
      p.height === Infinity ||
      ([
        'FastList',
        'FastGrid',
        'MasonryFastGrid',
        'ListView',
        'ListView.builder',
        'GridView',
        'GridView.count',
        'GridView.builder',
        'SingleChildScrollView',
        'CustomScrollView',
        'IndexedStack',
        'VideoPlayerWithControls',
      ].includes(name) &&
        !p.shrinkWrap &&
        p.physics?.valueType !== 'NeverScrollableScrollPhysics') ||
      (name === 'Column' &&
        symbol(p.mainAxisSize) !== 'min' &&
        [...el.children].some((c) =>
          ['Expanded', 'Flexible', 'Spacer'].includes(c.dataset.widget),
        )) ||
      (heightWrapper &&
        p.height == null &&
        [...el.children].some((c) => c.dataset.expandHeight === 'true'));
    if (fillsHeight && boundedHeight) {
      el.dataset.expandHeight = 'true';
      el.style.height = '100%';
      el.style.minHeight = '0';
    }
    if (tightWidth) {
      el.style.width = '100%';
      el.style.minWidth = '0';
    }
    if (tightHeight) {
      el.style.height = '100%';
      el.style.minHeight = '0';
    }
    el.dataset.instance = instanceId;
    el.dataset.widget = name;
    if (p.constraints) el.dataset.constraints = JSON.stringify(p.constraints);
    if (v.node) el.dataset.definition = `${v.node.file}:${v.node.start}`;
    if (name === 'SearchBar')
      for (const input of el.querySelectorAll('input.search-input')) {
        input.dataset.source = `${v.node?.file}:${v.node?.start}`;
        input.dataset.instance = instanceId;
      }
    if (selectedNode) {
      el.dataset.source = `${selectedNode.file}:${selectedNode.start}`;
      el.dataset.widget = name;
      if (selected === el.dataset.source && (!instance || v.componentNode === instance))
        el.classList.add('selected-widget');
      if (mode === 'design') {
        el.classList.add('selectable');
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect(selectedNode, instanceId);
        });
      }
    }
    return el;
  }
  try {
    const root = render(tree);
    if (usesShimmer || root.querySelector('.dn-shimmer-surface')) {
      const sheet = document.createElement('style');
      sheet.textContent = shimmerCSS;
      root.prepend(sheet);
    }
    const search =
      platform === 'android' ? root.querySelector('.dn-SearchBar[data-open="true"]') : null;
    if (search && !runtime.overlays.length) {
      const host = document.createElement('div');
      host.className = 'native-search-host';
      search.remove();
      root.inert = true;
      host.append(root, search);
      return host;
    }
    const overlay = renderOverlays(runtime, { platform, mode, render });
    if (overlay) {
      const host = document.createElement('div');
      host.className = 'native-overlay-host';
      root.inert = true;
      host.append(root, overlay);
      return host;
    }
    return root;
  } finally {
    if (mode !== 'thumbnail') runtime.maps?.finishFrame(mapViews);
    runtime.camera?.finishFrame(cameraViews);
    runtime.canvas?.finishFrame(canvasViews);
    runtime.videos?.finishFrame(videoViews);
    runtime.gestures?.finishFrame(gestureViews);
    runtime.lottie?.finishFrame(lottieViews);
    runtime.images?.finishFrame(imageViews);
  }
}
