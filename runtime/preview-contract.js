import { sdkAPI as socialSDK } from './social-sdk-api.js';
import { sdkAPI } from './sdk-api.js';
import { sdkAPI as lottieSDK } from './lottie-sdk-api.js';
import { sdkAPI as videoSDK } from './video-sdk-api.js';
import { sdkAPI as cameraSDK } from './camera-sdk-api.js';
import { sdkAPI as mapsSDK } from './maps-sdk-api.js';
import { implicitTiming } from './preview-implicit.js';

// Explicit browser capabilities. The SDK snapshot checks spelling and required
// arguments; this table says which of those arguments the adapter implements.
export const previewProps = {
  GoogleMaps:
    'initialCameraPosition mapType zoomGesturesEnabled scrollGesturesEnabled markers onMapReady onMarkerTap onCameraMove',
  GoogleMapsView: 'initialCameraPosition mapType zoomGesturesEnabled scrollGesturesEnabled markers',
  CameraPreview: 'controller enablePinchToZoom enableTapToFocus',
  App: 'home title theme',
  ValueListenableBuilder: 'valueListenable builder child',
  FutureBuilder: 'future initialData builder',
  CustomPaint: 'painter foregroundPainter size child',
  Scaffold:
    'body appBar bottomNavigationBar backgroundColor bottomInputBar brightness extendBodyBehindAppBar extendBody resizeToAvoidBottomInset',
  AppBar:
    'leading title actions backgroundColor automaticallyImplyLeading showBackTitle centerTitle toolbarHeight subtitle largeTitle searchBar titleSpacing actionsPadding actionsGlassBackground titleGlassBackground',
  Column: 'children mainAxisAlignment crossAxisAlignment mainAxisSize verticalDirection',
  Row: 'children mainAxisAlignment crossAxisAlignment mainAxisSize verticalDirection',
  Wrap: 'children direction alignment spacing runAlignment runSpacing crossAxisAlignment',
  IndexedStack: 'index children alignment',
  Stack: 'children alignment fit clipBehavior',
  Positioned: 'child left top right bottom width height',
  'Positioned.fill': 'child',
  Expanded: 'child flex',
  Flexible: 'child flex fit',
  Spacer: 'flex',
  Padding: 'padding child',
  Container: 'child padding margin decoration constraints width height color alignment',
  AnimatedContainer: 'child padding margin decoration width height color duration curve onEnd',
  SizedBox: 'child width height',
  Center: 'child widthFactor heightFactor',
  Align: 'child alignment',
  'SizedBox.shrink': 'child',
  'SizedBox.expand': 'child',
  'SizedBox.square': 'child dimension',
  SafeArea: 'child top bottom left right',
  SingleChildScrollView: 'child scrollDirection reverse padding showScrollBar controller',
  ListView:
    'children padding scrollDirection reverse shrinkWrap itemExtent showScrollBar controller listController',
  'ListView.builder':
    'itemCount itemBuilder padding scrollDirection reverse shrinkWrap itemExtent showScrollBar controller listController',
  FastList:
    'itemCount itemBuilder padding scrollDirection reverse showScrollBar controller onScroll keepAliveCount stableItems',
  CustomScrollView:
    'slivers controller listController scrollDirection reverse shrinkWrap padding showScrollBar',
  'SliverList.builder': 'itemBuilder itemCount',
  'SliverList.list': 'children',
  SliverPadding: 'padding sliver',
  SliverToBoxAdapter: 'child',
  FastGrid:
    'itemCount itemBuilder crossAxisCount childAspectRatio mainAxisSpacing crossAxisSpacing padding gridController onScroll keepAliveCount scrollDirection',
  MasonryFastGrid:
    'itemCount itemBuilder itemHeightBuilder crossAxisCount mainAxisSpacing crossAxisSpacing padding gridController onScroll keepAliveCount',
  'GridView.builder':
    'itemCount itemBuilder gridDelegate padding shrinkWrap scrollDirection showScrollBar physics',
  GridView: 'gridDelegate children padding shrinkWrap scrollDirection showScrollBar physics',
  'GridView.count':
    'crossAxisCount mainAxisSpacing crossAxisSpacing childAspectRatio mainAxisExtent children padding shrinkWrap scrollDirection showScrollBar physics',
  Text: 'style textAlign textDirection overflow maxLines softWrap selectable',
  RichText: 'text textAlign maxLines overflow',
  TextSpan: 'text children style',
  Icon: 'size color',
  IconButton: 'onPressed icon color iconSize padding',
  BarButtonItem: 'title titleStyle onPressed fontIcon',
  BackButton: 'icon iconSize iconColor title titleStyle onTap padding',
  Button:
    'title child onPressed variant color foregroundColor padding shape width height fontSize fontWeight imageAsset imageSize',
  Switch: 'value onChanged activeThumbColor activeTrackColor inactiveThumbColor inactiveTrackColor',
  Checkbox: 'value onChanged tristate activeColor checkColor',
  TextField:
    'textAlignVertical controller decoration keyboardType textInputAction textCapitalization style textAlign maxLines minLines maxLength obscureText autocorrect autofocus readOnly enabled cursorColor onChanged onSubmitted onTap onEditingComplete',
  ListTile: 'leading title subtitle trailing onTap tileColor contentPadding',
  Card: 'child color elevation borderRadius shape padding',
  Divider: 'height thickness color indent endIndent',
  GestureDetector:
    'child onTap onTapDown onTapUp onTapCancel onDoubleTap onPanStart onPanUpdate onPanEnd onPanCancel behavior',
  InkWell: 'child onTap',
  IgnorePointer: 'child ignoring',
  GlassEffectContainer: 'child borderRadius tint interactive brightness style shadow',
  GlassEffectGroup: 'child spacing',
  Badge: 'child count label badgeColor labelColor isLarge',
  FloatingActionButton: 'child onPressed backgroundColor foregroundColor mini',
  Visibility: 'child visible replacement',
  Opacity: 'opacity child',
  Image:
    'image width height fit color alignment cacheWidth cacheHeight cachePolicy placeholder placeholderMinDuration errorWidget fadeInDuration',
  'Image.network':
    'width height fit alignment cacheWidth cacheHeight cachePolicy placeholder placeholderMinDuration errorWidget fadeInDuration',
  'Image.asset': 'width height fit color alignment cacheWidth cacheHeight',
  'Image.file': 'width height fit cacheWidth cacheHeight',
  'Shimmer.fromColors': 'child baseColor highlightColor period enabled loop style',
  Lottie: 'asset json url cachePolicy loop autoplay speed fit controller placeholder',
  'Lottie.network': 'cachePolicy loop autoplay speed fit controller placeholder',
  VideoPlayer: 'controller aspectRatio fit expandToFill showControls',
  VideoPlayerWithControls:
    'controller aspectRatio onExitFullScreen controlsMode centeringMode topBarHeight playIcon pauseIcon forwardIcon rewindIcon minimizeIcon expandIcon onExpandFullScreen',
  Hero: 'tag child',
  ClipOval: 'child',
  'Transform.translate': 'offset transformHitTests child',
  ClipRRect: 'borderRadius child',
  BottomNavigationBar:
    'items currentIndex onTap backgroundColor indicatorColor iconColor selectedIconColor labelFontStyle selectedLabelFontStyle scrollBehavior',
  BottomNavigationBarItem: 'label icon subtitle enabled activeIcon',
  SearchBar: 'hintText onChanged onSubmitted onClosed suggestions backgroundColor surfaceColor',
  SegmentedControl:
    'segments selectedIndex onValueChanged indicatorColor backgroundColor labelFontStyle selectedLabelFontStyle',
  Slider:
    'value onChanged onChangeStart onChangeEnd min max divisions activeColor inactiveColor thumbColor',
  CircularProgressIndicator: 'color strokeWidth value backgroundColor',
  LinearProgressIndicator: 'value color backgroundColor minHeight',
  ColoredBox: 'color child',
  ConstrainedBox: 'constraints child',
  FractionallySizedBox: 'widthFactor heightFactor alignment child',
};
export const hostFunctions = new Set([
  'showAlert',
  'showActionSheet',
  'showModalBottomSheet',
  'showDatePicker',
  'showColorPicker',
]);
export function sdkSignature(name) {
  const [base, constructor = ''] = name.split('.');
  const entry =
    sdkAPI.symbols[base] ??
    lottieSDK.symbols[base] ??
    videoSDK.symbols[base] ??
    cameraSDK.symbols[base] ??
    mapsSDK.symbols[base] ??
    socialSDK.symbols[base];
  return entry?.kind === 'function' ? entry : entry?.constructors?.[constructor];
}
export function sdkEnumValues(name) {
  const entry =
    sdkAPI.symbols[name] ??
    lottieSDK.symbols[name] ??
    videoSDK.symbols[name] ??
    cameraSDK.symbols[name] ??
    mapsSDK.symbols[name] ??
    socialSDK.symbols[name];
  return entry?.kind === 'enum' ? entry.values : null;
}
export function checkSDKCall(name, args, props, { preview = false } = {}) {
  const signature = sdkSignature(name);
  if (!signature) throw Error(`${name} is not an exported constructor in this DartNative SDK.`);
  const params = signature.parameters,
    positional = params.filter((p) => !p.named),
    named = params.filter((p) => p.named);
  if (args.length < positional.filter((p) => p.required).length || args.length > positional.length)
    throw Error(
      `${name} expects ${positional.filter((p) => p.required).length}–${positional.length} positional arguments.`,
    );
  for (const p of named)
    if (p.required && !Object.hasOwn(props, p.name)) throw Error(`${name} requires ${p.name}.`);
  for (const key of Object.keys(props)) {
    if (!named.some((p) => p.name === key))
      throw Error(`${name}.${key} is not in the DartNative SDK.`);
    if (preview && key !== 'key' && !previewProps[name]?.split(' ').includes(key))
      throw Error(`${name}.${key} has no browser adapter yet. It is preserved in source.`);
  }
  const number = (key, { min = -Infinity, max = Infinity, integer = false } = {}) => {
    const v = props[key];
    if (
      v != null &&
      (typeof v !== 'number' ||
        !Number.isFinite(v) ||
        v < min ||
        v > max ||
        (integer && !Number.isInteger(v)))
    )
      throw Error(
        `${name}.${key} needs ${integer ? 'an integer' : 'a finite number'} between ${min} and ${max}.`,
      );
  };
  if (name === 'SegmentedControl') {
    if (
      !Array.isArray(props.segments) ||
      !props.segments.length ||
      props.segments.length > 50 ||
      !props.segments.every((s) => typeof s === 'string')
    )
      throw Error('SegmentedControl.segments needs 1–50 text labels.');
    number('selectedIndex', { min: 0, max: props.segments.length - 1, integer: true });
  }
  if (name === 'Lottie' || name === 'Lottie.network') {
    number('speed', { min: 0, max: 32 });
    for (const key of ['loop', 'autoplay'])
      if (props[key] != null && typeof props[key] !== 'boolean')
        throw Error(`Lottie.${key} needs a boolean.`);
    if (
      props.fit != null &&
      !['LottieFit.fill', 'LottieFit.contain', 'LottieFit.cover'].includes(props.fit.symbol)
    )
      throw Error('Invalid Lottie fit.');
    if (
      props.cachePolicy != null &&
      !['LottieCachePolicy.disk', 'LottieCachePolicy.none'].includes(props.cachePolicy.symbol)
    )
      throw Error('Invalid Lottie cache policy.');
    if (
      name === 'Lottie' &&
      [props.asset, props.json, props.url].filter((x) => x != null).length !== 1
    )
      throw Error('Lottie needs exactly one of asset, json or url.');
  }
  if (name === 'VideoPlayer' || name === 'VideoPlayerWithControls') {
    number('aspectRatio', { min: 0.01, max: 100 });
    number('topBarHeight', { min: 0, max: 874 });
    for (const key of ['expandToFill', 'showControls'])
      if (props[key] != null && typeof props[key] !== 'boolean')
        throw Error(`${name}.${key} needs a boolean.`);
    if (
      props.controlsMode != null &&
      !['VideoControlsMode.overlay', 'VideoControlsMode.bottomBar'].includes(
        props.controlsMode.symbol,
      )
    )
      throw Error('Unknown video controls mode.');
    if (
      props.centeringMode != null &&
      !['VideoPlayerCenteringMode.absolute', 'VideoPlayerCenteringMode.relative'].includes(
        props.centeringMode.symbol,
      )
    )
      throw Error('Unknown video centering mode.');
  }
  if (name === 'Button') {
    number('imageSize', { min: 0, max: 8192 });
    if (props.imageAsset != null && typeof props.imageAsset !== 'string')
      throw Error('Button.imageAsset needs an asset path or symbol name.');
  }
  if (name === 'Hero' && props.tag == null) throw Error('Hero.tag must not be null.');
  if (name === 'CameraPreview')
    for (const key of ['enablePinchToZoom', 'enableTapToFocus'])
      if (props[key] != null && typeof props[key] !== 'boolean')
        throw Error(`${key} must be a boolean.`);
  if (name === 'AnimatedContainer') {
    implicitTiming(props);
    number('width', { min: 0 });
    number('height', { min: 0 });
    if (props.decoration?.props?.gradient)
      throw Error('AnimatedContainer gradients need another browser adapter.');
  }
  if (name === 'GlassEffectGroup') number('spacing', { min: 0, max: 128 });
  if (name === 'Badge') {
    number('count', { integer: true });
    if (props.label != null && typeof props.label !== 'string')
      throw Error('Badge.label needs text.');
    if (props.isLarge != null && typeof props.isLarge !== 'boolean')
      throw Error('Badge.isLarge needs a boolean.');
  }
  if (
    name === 'BottomNavigationBar' &&
    props.scrollBehavior != null &&
    ![
      'TabBarScrollBehavior.none',
      'TabBarScrollBehavior.minimizeOnScrollDown',
      'TabBarScrollBehavior.minimizeOnScrollUp',
    ].includes(props.scrollBehavior.symbol)
  )
    throw Error('Unknown tab bar scroll behavior.');
  if (name === 'Transform.translate') {
    if (
      props.offset?.valueType !== 'Offset' ||
      props.offset.args.length !== 2 ||
      props.offset.args.some((v) => !Number.isFinite(v))
    )
      throw Error('Transform.translate needs a finite Offset.');
    if (props.transformHitTests === false)
      throw Error('Transform without transformed hit tests needs another browser adapter.');
  }
  if (name === 'Card' && props.elevation != null && props.elevation !== 0)
    throw Error('Card: nonzero elevation has no browser adapter yet. Use BoxDecoration.boxShadow.');
  if (
    name === 'Scaffold' &&
    props.resizeToAvoidBottomInset != null &&
    typeof props.resizeToAvoidBottomInset !== 'boolean'
  )
    throw Error('resizeToAvoidBottomInset needs a boolean.');
  if (name === 'Center')
    for (const key of ['widthFactor', 'heightFactor'])
      if (props[key] != null && props[key] !== 1)
        throw Error('Center sizing factors other than 1 need another browser adapter.');
  if (
    name === 'TextField' &&
    props.textAlignVertical != null &&
    (!(props.maxLines === null || props.maxLines > 1) ||
      props.textAlignVertical.symbol !== 'TextAlignVertical.top')
  )
    throw Error(
      'Explicit vertical text alignment currently supports top-aligned multiline fields.',
    );
  if (name.startsWith('GridView') && props.scrollDirection?.symbol === 'Axis.horizontal')
    throw Error('Horizontal GridView has no browser adapter yet.');
  if (name === 'Slider') {
    number('min');
    number('max');
    number('value', { min: props.min ?? 0, max: props.max ?? 1 });
    number('divisions', { min: 1, max: 1000, integer: true });
    if ((props.max ?? 1) <= (props.min ?? 0)) throw Error('Slider.max must be greater than min.');
  }
  if (name.endsWith('ProgressIndicator')) {
    number('value', { min: 0, max: 1 });
    number('strokeWidth', { min: 0 });
    number('minHeight', { min: 0 });
  }
  for (const [key, value] of Object.entries(props))
    if (key.startsWith('on') && value != null && typeof value !== 'function')
      throw Error(`${name}.${key} needs a callback.`);
}
export function generationCapabilities() {
  return Object.entries(previewProps)
    .map(([name, props]) => `${name}: ${props}`)
    .join('\n');
}
