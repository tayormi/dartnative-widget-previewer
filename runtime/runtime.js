import {
  PreviewSocial,
  PreviewGoogleSignIn,
  SocialValue,
  SocialException,
  socialCalls,
} from './preview-social.js';
import { MapValue, createMapValue, mapCalls, mapTypes } from './map-values.js';
import { PreviewMaps } from './preview-maps.js';
import { PreviewSpeech, SpeechValue, speechCalls } from './preview-speech.js';
import { PreviewFileAudio, PreviewFileAudioPlayer } from './preview-file-audio.js';
import { PreviewEventStream } from './preview-events.js';
import { PreviewCamera, PreviewCameraController, cameraCalls } from './preview-camera.js';
import { PreviewNotifications, notificationCalls } from './preview-notifications.js';
import { PreviewFirebase, FirebaseMessage, firebaseCalls } from './preview-firebase.js';
import { DartEnumValue, enumMember } from './dart-enums.js';
import { DartFuture, unwrapFuture } from './dart-future.js';
import { PreviewAudio, PreviewPcmPlayer } from './preview-pcm.js';
import {
  TypedDataMemory,
  DartTypedList,
  DartByteData,
  DartByteBuffer,
  typedDataCalls,
} from './typed-data.js';
import { routeOptions } from './preview-transitions.js';
import { VirtualCollection, virtualWidgets } from './virtual-collection.js';
import { PreviewNetwork, networkCalls } from './preview-network.js';
import { PreviewImages, imageCalls } from './preview-images.js';
import { PreviewLottie } from './preview-lottie.js';
import { PreviewLottieController } from './lottie-controller.js';
import { PreviewVideos, PreviewVideoController, videoValues } from './preview-video.js';
import { PreviewViewport } from './preview-viewport.js';
import { PreviewGestures } from './preview-gestures.js';
import { PreviewCanvas } from './preview-canvas.js';
import { CanvasValue, CanvasPaint, canvasConstructors } from './canvas-values.js';
import { PreviewFutures } from './preview-futures.js';
import { dartString } from './dart-string.js';
import {
  Env,
  dartInvocation,
  invokeDart,
  bindParameters,
  DartObject,
  DartSuper,
  baseType,
  isDartType,
  classScope,
  createDartObject,
} from './dart-environment.js';
import {
  ReactiveGraph,
  PreviewSignal,
  PreviewComputed,
  PreviewChangeNotifier,
  PreviewTextController,
} from './reactive-state.js';
import {
  Completion,
  ReturnValue,
  LoopFlow,
  equal,
  bindPattern,
  runLoop,
  runLoopAsync,
  catchScope,
} from './dart-control-flow.js';
import { DartListMap } from './dart-collections.js';
import { PreviewStorage, storageCalls } from './preview-storage.js';
import { memoryStorageBackend } from './preview-storage-backend.js';
import { BrowserServices, browserServiceCalls } from './browser-services.js';
import {
  PreviewScrollController,
  PreviewAnimationController,
  durationMilliseconds,
  frameClock,
  createStopwatch,
} from './preview-controllers.js';
import { PreviewNotifier } from './notifiers.js';
import { boxShadows } from './style-values.js';
import { createPreferenceStore } from './package-catalog.js';
import {
  previewProps,
  hostFunctions,
  checkSDKCall,
  sdkSignature,
  sdkEnumValues,
} from './preview-contract.js';
// Restricted AST interpreter: no eval, Function(), imports, FFI, or ambient JS access.
export class PreviewError extends Error {}
class LimitError extends PreviewError {}
class PreviewContext {
  constructor(providers = new Map(), inherited = new Map(), element = null) {
    this.providers = providers;
    this.inherited = inherited;
    this.element = element;
  }
}
export const widgetNames = new Set(Object.keys(previewProps));
const values = new Set([
  'String.fromEnvironment',
  'int.fromEnvironment',
  'bool.fromEnvironment',
  'StadiumBorder',
  'AssetImage',
  ...videoValues,
  'Color.fromARGB',
  'Color.fromRGBO',
  'TextStyle',
  'ThemeData',
  'TextTheme',
  'ColorScheme',
  'DNPreviewLocalizations',
  'BoxDecoration',
  'BoxShadow',
  'BorderRadius.circular',
  'BorderRadius.all',
  'Radius.circular',
  'Border.all',
  'Border',
  'BorderSide',
  'EdgeInsets.all',
  'EdgeInsets.symmetric',
  'EdgeInsets.only',
  'EdgeInsets.fromLTRB',
  'Color',
  'Size',
  'Offset',
  'InputDecoration',
  'PageRoute',
  'AppBarIOSConfig',
  'Duration',
  'Stopwatch',
  'RoundedRectangleBorder',
  'ValueKey',
  'Key',
  'LinearGradient',
  'BorderRadius.only',
  'BorderRadius.vertical',
  'Radius.elliptical',
  'BoxConstraints',
  'BoxConstraints.tight',
  'BoxConstraints.tightFor',
  'BoxConstraints.expand',
  'SliverGridDelegateWithFixedCrossAxisCount',
  'Shadow',
  'SystemUiOverlayStyle',
  'ThemeData.light',
  'ThemeData.dark',
  'NeverScrollableScrollPhysics',
]);
const colors = {
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
  grey: '#8e8e93',
  gray: '#8e8e93',
  blue: '#007aff',
  green: '#34c759',
  red: '#ff3b30',
  orange: '#ff9500',
  purple: '#af52de',
  teal: '#14a39a',
  indigo: '#5856d6',
};
const symbol = (name) => ({ symbol: name });
const isSymbol = (x) => x && typeof x === 'object' && Object.hasOwn(x, 'symbol');
const errorText = (e) => e?.message ?? String(e);
const wrapError = (e, node) => ({
  widget: 'Unsupported',
  name: errorText(e),
  node,
  props: {},
  args: [],
});
export class Runtime {
  constructor(
    model,
    onChange = () => {},
    {
      preferences = createPreferenceStore(),
      appState = new Map(),
      browserEnvironment = globalThis,
      storage = {},
      firebase = {},
      maps = {},
      social = {},
      dartDefines = {},
    } = {},
  ) {
    this.browserEnvironment = browserEnvironment;
    this.socialOptions = social;
    if (
      !dartDefines ||
      typeof dartDefines !== 'object' ||
      Object.values(dartDefines).some((v) => typeof v !== 'string')
    )
      throw Error('Dart environment values must be strings.');
    this.dartDefines = Object.freeze({ ...dartDefines });
    this.firebaseOptions = firebase;
    this.mapsOptions = maps;
    this.storageOptions = { backend: memoryStorageBackend(), ...storage };
    this.preferences = preferences;
    this.classScopes = new Map();
    this.graph = new ReactiveGraph();
    this.notifierObjects = new WeakMap();
    this.currentContext = new PreviewContext();
    this.appState = appState;
    this.virtualCollections = new Map();
    this.renderedVirtual = new Set();
    this.reactiveInstances = new Map();
    this.renderedReactive = new Set();
    this.model = model;
    this.onChange = onChange;
    this.instances = new Map();
    this.routeIds = new WeakMap();
    this.nextRouteId = 0;
    this.currentRoute = null;
    this.renderedInstances = new Set();
    this.routeTrees = new Map();
    this.parentInstance = '';
    this.stack = [];
    this.routeResults = new Map();
    this.routeOptions = new Map();
    this.navigation = null;
    this.heroTags = new Map();
    this.nextHeroId = 0;
    this.routeChrome = new Map();
    this.pendingChrome = null;
    this.systemUIStyle = null;
    this.errors = [];
    this.logs = [];
    this.actionErrors = [];
    this.steps = 0;
    this.numericDeadline = null;
    this.limit = 20000;
    this.depth = 0;
    this.global = new Env();
    this.selectedRoot = null;
    this.occurrences = new Map();
    this.uiState = new Map();
    this.overlays = [];
    this.epoch = 0;
    this.disposed = false;
    this.cleanups = new Set();
    this.pending = new Set();
    this.initialize();
    this.initializationErrors = [...this.errors];
  }
  defaultTheme(brightness) {
    const dark = brightness === 'dark',
      color = (value) => ({ valueType: 'Color', args: [value], props: {} });
    return {
      valueType: 'ThemeData',
      props: {
        brightness: symbol('Brightness.' + brightness),
        colorScheme: {
          valueType: 'ColorScheme',
          props: {
            brightness: symbol('Brightness.' + brightness),
            primary: color(0xff007aff),
            onPrimary: color(0xffffffff),
            surface: color(dark ? 0xff1c1c1e : 0xffffffff),
            onSurface: color(dark ? 0xffffffff : 0xff000000),
            onSurfaceVariant: color(dark ? 0xffaeaeb2 : 0xff636366),
            outline: color(dark ? 0xff48484a : 0xffc7c7cc),
          },
        },
        textTheme: { valueType: 'TextTheme', props: {} },
        scaffoldBackgroundColor: color(dark ? 0xff000000 : 0xfff2f2f7),
      },
    };
  }
  tick() {
    if (++this.steps > this.limit) throw new LimitError('Preview execution limit reached.');
  }
  initialize() {
    this.network = new PreviewNetwork(this.browserEnvironment);
    this.images = new PreviewImages(this.network, this.browserEnvironment);
    this.lottie = new PreviewLottie(
      this.network,
      this.storageOptions.backend,
      this.browserEnvironment,
    );
    this.videos = new PreviewVideos(this);
    this.viewport = new PreviewViewport(this);
    this.gestures = new PreviewGestures(this);
    this.canvas = new PreviewCanvas(this);
    this.futures = new PreviewFutures(this);
    this.typedData = new TypedDataMemory();
    this.audio = new PreviewAudio(this);
    this.speech = new PreviewSpeech(this);
    this.services = new BrowserServices(this, this.browserEnvironment);
    this.fileAudio = new PreviewFileAudio(this);
    this.camera = new PreviewCamera(this);
    this.notifications = new PreviewNotifications(this);
    this.firebase = new PreviewFirebase(this, this.firebaseOptions);
    this.maps = new PreviewMaps(this, this.mapsOptions);
    this.social = new PreviewSocial(this, this.socialOptions);
    this.storage = new PreviewStorage(this, this.storageOptions);
    this.global.values.SharedPreferences = { getInstance: async () => this.preferences };
    for (const n of [
      'Colors',
      'FontWeight',
      'TextAlign',
      'MainAxisAlignment',
      'CrossAxisAlignment',
      'MainAxisSize',
      'Alignment',
      'Brightness',
      'Clip',
      'Icons',
      'CupertinoIcons',
      'MaterialSymbolsRounded',
      'MaterialSymbolsSharp',
      'MaterialSymbolsOutlined',
      'Axis',
      'BoxFit',
      'Navigator',
      'RouteTransition',
      'BorderStyle',
      'ButtonVariant',
      'double',
      'int',
      'WrapAlignment',
      'WrapCrossAlignment',
      'FlexFit',
      'FontStyle',
      'TextDecoration',
      'TextDirection',
      'TextOverflow',
      'VerticalDirection',
      'StackFit',
      'BoxShape',
      'NativeDatePickerMode',
      'TextInputType',
      'TextInputAction',
      'String',
      'bool',
      'Provided',
      'MediaQuery',
      'Theme',
      'DNPreviewScope',
      'Directionality',
      'DefaultTextStyle',
      'TextDirection',
      'List',
      'DateTime',
      'InputBorder',
      'Platform',
      'SystemChrome',
      'Curves',
      'AnimationStatus',
      'Timer',
      'Future',
      'TextCapitalization',
      'HitTestBehavior',
      'GlassStyle',
      'Share',
      'ShareResultStatus',
      'MediaPickerType',
      'DartNativeCompressor',
      'DartNativeImageCrop',
      'File',
      'AudioPlayerEvent',
      'SecureStorage',
      'Hive',
      'Sqlite',
      'Directory',
      'ConflictAlgorithm',
      'HttpClient',
      'HttpHeaders',
      'Uri',
      'ImageCache',
      'ImageCachePolicy',
      'ShimmerStyle',
      'ProcessInfo',
      'LottieFit',
      'LottieCachePolicy',
      'LottieController',
      'LottieLoopMode',
      'VideoPlayerController',
      'VideoDataSourceType',
      'VideoControlsMode',
      'VideoPlayerCenteringMode',
      'VideoEventType',
      'Orientation',
      'DeviceOrientation',
      'DeviceOrientationListener',
      'DartNativeCamera',
      'CameraLensDirection',
      'ResolutionPreset',
      'VideoQuality',
      'VideoAspectRatio',
      'FlashMode',
      'CaptureOrientation',
      'RecordingEventKind',
      'GoogleSignIn',
      'SignInWithApple',
      'AppleIDAuthorizationScopes',
      'AuthorizationErrorCode',
      'GoogleSignInFFIBindings',
      'SignInWithAppleFFIBindings',
      'DartNativeNotifications',
      'Firebase',
      'FirebaseMessaging',
      'MapType',
      'LatLng',
      'CameraPosition',
      'Marker',
      'initializeGoogleMapsPlugin',
      'DynamicColor',
      'TabBarScrollBehavior',
      'SuperTonicTTS',
      'SuperTonicVariant',
      'ModelManager',
      'TTSLanguage',
      'TTSTestStrings',
      'TextAlignVertical',
      'PcmStreamPlayer',
      'Endian',
      'PaintingStyle',
      'StrokeCap',
      'StrokeJoin',
      'BlendMode',
      'TileMode',
      'TextLeadingDistribution',
      'TextAffinity',
      'ConnectionState',
    ])
      this.global.values[n] = symbol(n);
    for (const n of [
      ...values,
      ...widgetNames,
      ...canvasConstructors,
      ...typedDataCalls,
      ...socialCalls,
    ])
      this.global.values[n.split('.')[0]] ??= symbol(n.split('.')[0]);
    this.global.values.supertonicVoices = this.speech.read('supertonicVoices');
    this.global.values.kSuperTonicVoiceFiles = this.speech.read('kSuperTonicVoiceFiles');
    this.global.values.context = null;
    this.global.values.WidgetsBinding = {
      instance: { addPostFrameCallback: (fn) => this.postFrame(fn) },
    };
    this.global.values.isIOS26 = true;
    this.global.values.isIOS = true;
    this.global.values.isAndroid = false;
    this.global.values.kToolbarHeight = 44;
    for (const name of Object.keys(this.model.classes)) this.global.values[name] = symbol(name);
    for (const [name, entries] of Object.entries(this.model.enums || {}))
      this.global.values[name] = {
        enumNamespace: name,
        values: entries.map((entry, index) =>
          this.model.enumConstants?.[name]?.[entry]
            ? new DartEnumValue(this, name, entry, index, this.model.enumConstants[name][entry])
            : { enumType: name, name: entry, index, symbol: `${name}.${entry}` },
        ),
      };
    for (const [name, node] of Object.entries(this.model.functions))
      this.global.values[name] = this.eval(node, this.global);
    for (const [name, node] of Object.entries(this.model.getters || {}))
      this.global.getters[name] = this.eval(node, this.global);
    for (const [name, node] of Object.entries(this.model.setters || {}))
      this.global.setters[name] = this.eval(node, this.global);
    const resolving = new Set(),
      resolved = new Set();
    this.global.resolve = (name) => {
      if (!Object.hasOwn(this.model.globals, name))
        throw new PreviewError(`Unresolved value: ${name}`);
      if (resolved.has(name)) return this.global.values[name];
      if (resolving.has(name)) throw new PreviewError(`Circular global value: ${name}`);
      resolving.add(name);
      try {
        const declaration = this.model.globals[name];
        const shared = declaration?.kind === 'call' && declaration.name === 'ValueNotifier';
        const value =
          shared && this.appState.has(name)
            ? this.appState.get(name)
            : this.eval(declaration, this.global);
        if (shared) this.appState.set(name, value);
        this.global.values[name] = value;
        resolved.add(name);
        return value;
      } finally {
        resolving.delete(name);
      }
    };
    // Dart top-level fields are lazy. Unused declarations must not run plugin
    // initialization or poison an otherwise supported screen.
    if (this.model.startup?.body) {
      const startup = {
        kind: 'lambda',
        params: [],
        parameters: [],
        body: this.model.startup.body,
        async: !!this.model.startup.async,
      };
      try {
        this.startupTask = this.eval(startup, this.global)();
        if (this.startupTask instanceof Promise) {
          this.startupPending = true;
          const epoch = this.epoch;
          this.startupTask.then(
            () => {
              if (this.epoch === epoch && !this.disposed) {
                this.startupPending = false;
                this.onChange();
              }
            },
            (error) => {
              if (this.epoch === epoch && !this.disposed) {
                this.startupPending = false;
                this.initializationErrors.push(errorText(error));
                this.onChange();
              }
            },
          );
        }
      } catch (error) {
        this.errors.push(errorText(error));
      }
    }
  }

  render(root = this.selectedRoot, { route = this.stack.at(-1) ?? null, lifecycle = true } = {}) {
    const previousLifecycle = this.lifecycle;
    this.lifecycle = lifecycle;
    this.steps = 0;
    this.numericDeadline = null;
    this.depth = 0;
    this.errors = [...this.initializationErrors];
    this.occurrences.clear();
    this.currentRoute = route;
    this.renderedInstances = new Set();
    this.renderedReactive = new Set();
    this.renderedVirtual = new Set();
    this.futures.beginFrame();
    this.parentInstance = '';
    const cacheKey = this.currentRoute ?? (root || 'entry');
    try {
      if (this.startupPending || this.speech.pending)
        return { widget: 'Text', args: ['Starting app…'], props: {} };
      const expression = this.currentRoute
        ? this.currentRoute
        : root
          ? { kind: 'call', name: root, args: [], named: {} }
          : this.model.root;
      if (!expression) throw new PreviewError('Choose a screen class to preview.');
      let tree = this.routeTrees.get(cacheKey);
      if (!tree)
        tree = typeof expression === 'function' ? expression() : this.eval(expression, this.global);
      tree = this.refreshTree(tree);
      tree = this.registerHeroes(tree);
      this.routeTrees.set(cacheKey, tree);
      return tree;
    } catch (e) {
      this.errors.push(errorText(e));
      return wrapError(e, null);
    } finally {
      this.lifecycle = previousLifecycle;
      this.futures.finishFrame();
      // Hidden routes keep their state. Removed widgets and popped routes do not.
      for (const [key, state] of this.instances) {
        const popped = state.route != null && !this.stack.includes(state.route);
        const unmounted =
          !this.overlays.length &&
          state.route === this.currentRoute &&
          !this.renderedInstances.has(key);
        const retained =
          unmounted &&
          [...this.virtualCollections.values()].some(
            (collection) =>
              collection.retainState &&
              this.renderedVirtual.has(collection.key) &&
              key.startsWith(collection.key + '/item:'),
          );
        if (popped || (unmounted && !retained)) {
          this.disposeInstance(state);
          this.instances.delete(key);
        }
      }
      for (const [key, record] of this.reactiveInstances) {
        const popped = record.route != null && !this.stack.includes(record.route);
        const unmounted =
          !this.overlays.length &&
          record.route === this.currentRoute &&
          !this.renderedReactive.has(key);
        const retained =
          unmounted &&
          [...this.virtualCollections.values()].some(
            (collection) =>
              collection.retainState &&
              this.renderedVirtual.has(collection.key) &&
              key.startsWith(collection.key + '/item:'),
          );
        if (popped || (unmounted && !retained)) {
          record.notifier.removeListener(record.listener);
          this.reactiveInstances.delete(key);
        }
      }
      for (const [key, collection] of this.virtualCollections) {
        const popped = collection.route != null && !this.stack.includes(collection.route);
        const unmounted =
          !this.overlays.length &&
          collection.route === this.currentRoute &&
          !this.renderedVirtual.has(key);
        if (popped || unmounted) {
          collection.dispose();
          this.virtualCollections.delete(key);
        }
      }
      if (this.pendingChrome) {
        this.systemUIStyle = this.pendingChrome.style;
        this.pendingChrome = null;
      }
      for (const key of this.routeTrees.keys()) {
        if (
          (typeof key === 'function' && !this.stack.includes(key)) ||
          (typeof key === 'string' && this.currentRoute == null && key !== cacheKey)
        )
          this.routeTrees.delete(key);
      }
    }
  }
  registerHeroes(tree, tags = new Set()) {
    if (Array.isArray(tree)) return tree.map((child) => this.registerHeroes(child, tags));
    if (!tree?.widget) return tree;
    // A dirty state can refresh its subtree more than once. Validate the final
    // mounted tree, where each occurrence represents one actual Hero.
    if (tree.widget === 'Hero') {
      const tag = tree.props.tag;
      if (tags.has(tag))
        throw new PreviewError('A route cannot contain more than one Hero with the same tag.');
      tags.add(tag);
      if (!this.heroTags.has(tag)) this.heroTags.set(tag, String(++this.nextHeroId));
      tree = { ...tree, heroId: this.heroTags.get(tag) };
    }
    return {
      ...tree,
      props: Object.fromEntries(
        Object.entries(tree.props || {}).map(([key, child]) => [
          key,
          this.registerHeroes(child, tags),
        ]),
      ),
    };
  }
  refreshTree(value) {
    if (Array.isArray(value)) return value.map((child) => this.refreshTree(child));
    if (!value?.widget) return value;
    if (value.widget === 'DartWidget') return this.mountWidget(value);
    if (value.widget === 'App') {
      if (value.props.theme) {
        if (value.props.theme.valueType !== 'ThemeData')
          throw new PreviewError(
            value.props.theme.name || 'App.theme needs a supported ThemeData.',
          );
        this.brightness = this.previewEnvironment
          ? symbol('Brightness.' + this.previewEnvironment.brightness)
          : value.props.theme.props.brightness;
        this.theme = {
          ...value.props.theme,
          props: { ...value.props.theme.props, brightness: this.brightness },
        };
      }
      return this.refreshTree(value.props.home);
    }
    if (['Directionality', 'DNPreviewScope', 'DefaultTextStyle'].includes(value.widget)) {
      const inherited = new Map(this.currentContext.inherited);
      inherited.set(value.widget, value.props);
      const child = this.withContext(
        new PreviewContext(this.currentContext.providers, inherited),
        () => this.refreshTree(value.props.child),
      );
      return { ...value, props: { ...value.props, child } };
    }
    if (value.widget === 'Provided') {
      const providers = new Map(this.currentContext.providers);
      providers.set(value.type, value.value);
      return this.withContext(new PreviewContext(providers, this.currentContext.inherited), () =>
        this.refreshTree(value.props.child),
      );
    }
    if (['SliverList.builder'].includes(value.widget) && !value.props.children) {
      if (value.props.itemCount == null)
        throw new PreviewError(
          'An unbounded list builder needs an itemCount in the browser preview.',
        );
      const count = Number(value.props.itemCount ?? 0);
      if (!Number.isSafeInteger(count) || count < 0)
        throw new PreviewError('List itemCount must be a nonnegative integer.');
      const children = [];
      for (let i = 0; i < Math.min(count, 500); i++) {
        this.tick();
        children.push(this.refreshTree(value.props.itemBuilder(this.currentContext, i)));
      }
      value = { ...value, props: { ...value.props, children } };
    }
    let tree = value;
    const owners = tree.stateOwners || [];
    for (let i = 0; i < owners.length; i++) {
      const state = this.instances.get(owners[i]);
      if (state) this.activateState(state);
      if (state?.dirty) {
        tree = this.buildState(state);
        tree = { ...tree, stateOwners: [...owners.slice(0, i), ...tree.stateOwners] };
        break;
      }
    }
    for (const key of tree.stateOwners || []) this.renderedInstances.add(key);
    const resourceKey =
      tree.widget === 'GoogleMaps' || tree.widget === 'GoogleMapsView'
        ? 'mapKey'
        : tree.widget === 'Lottie' || tree.widget === 'Lottie.network'
          ? 'lottieKey'
          : tree.widget === 'VideoPlayer' || tree.widget === 'VideoPlayerWithControls'
            ? 'videoKey'
            : tree.widget === 'GestureDetector'
              ? 'gestureKey'
              : tree.widget === 'AnimatedContainer'
                ? 'implicitKey'
                : tree.widget === 'CustomPaint'
                  ? 'paintKey'
                  : tree.widget === 'FutureBuilder'
                    ? 'futureKey'
                    : null;
    if (resourceKey && !tree[resourceKey]) {
      const route = this.currentRoute;
      if (route && !this.routeIds.has(route)) this.routeIds.set(route, ++this.nextRouteId);
      const site = `${this.parentInstance}/${route ? this.routeIds.get(route) : 0}/${resourceKey}:${tree.node?.file}:${tree.node?.start}:${JSON.stringify(tree.props.key || null)}`;
      const occurrence = this.occurrences.get(site) || 0;
      this.occurrences.set(site, occurrence + 1);
      tree = { ...tree, [resourceKey]: `${site}:${occurrence}` };
    }
    if (virtualWidgets.has(tree.widget)) {
      let key = tree.virtualKey;
      if (!key) {
        const route = this.currentRoute;
        if (route && !this.routeIds.has(route)) this.routeIds.set(route, ++this.nextRouteId);
        const site = `${this.parentInstance}/${route ? this.routeIds.get(route) : 0}/virtual:${tree.node?.file}:${tree.node?.start}:${tree.widget}:${JSON.stringify(tree.props.key || null)}`;
        const occurrence = this.occurrences.get(site) || 0;
        this.occurrences.set(site, occurrence + 1);
        key = `${site}:${occurrence}`;
      }
      let collection = this.virtualCollections.get(key);
      if (!collection) {
        collection = new VirtualCollection(
          this,
          key,
          tree.node,
          this.currentContext,
          this.parentInstance,
        );
        this.virtualCollections.set(key, collection);
      }
      this.renderedVirtual.add(key);
      collection.configure(tree);
      const { children, indices } = collection.build();
      return {
        ...tree,
        virtualKey: key,
        virtualIndices: indices,
        props: { ...tree.props, children },
      };
    }
    if (tree.widget === 'FutureBuilder')
      return this.futures.build(
        tree,
        tree.buildContext ?? this.currentContext,
        `${tree.parentInstance ?? this.parentInstance}/${tree.futureKey}`,
      );
    if (tree.widget === 'ValueListenableBuilder') {
      const record = this.reactiveInstances.get(tree.reactiveKey);
      if (!record) throw new PreviewError('The value listener is no longer mounted.');
      this.renderedReactive.add(record.key);
      if (record.dirty) record.child = this.buildReactive(record);
      record.child = this.refreshTree(record.child);
      return { ...tree, props: { child: record.child } };
    }
    return {
      ...tree,
      props: Object.fromEntries(
        Object.entries(tree.props || {}).map(([key, child]) => [key, this.refreshTree(child)]),
      ),
    };
  }
  activateState(state) {
    if (this.lifecycle !== false && !state.initialized) {
      state.initialized = true;
      state.dirty = true;
      if (state.stateful && state.cls.methods.initState) state.scope.get('initState')();
    }
  }
  scheduleChange() {
    if (this.notifierUpdateScheduled || this.disposed) return;
    this.notifierUpdateScheduled = true;
    const epoch = this.epoch;
    queueMicrotask(() => {
      this.notifierUpdateScheduled = false;
      if (!this.disposed && epoch === this.epoch) this.onChange();
    });
  }
  attachNotifier(object) {
    const notifier = new PreviewChangeNotifier(this.graph);
    this.notifierObjects.set(object, notifier);
    for (const name of ['addListener', 'removeListener', 'notifyListeners', 'dispose'])
      if (!object.scope.owns(name))
        object.scope.values[name] = (...args) => notifier[name](...args);
  }
  watch(value, context) {
    const notifier = this.notifierObjects.get(value) || value,
      record = context?.element;
    if (!record || typeof notifier?.addListener !== 'function')
      throw new PreviewError('watch needs a Listenable and an active build context.');
    if (!record.dependencies.has(notifier)) {
      const listener = () => {
        record.dirty = true;
        this.scheduleChange();
      };
      record.dependencies.set(notifier, listener);
      notifier.addListener(listener);
    }
    return value instanceof PreviewSignal || value instanceof PreviewComputed ? value.value : value;
  }
  disposeInstance(state) {
    if (state.scope.values.mounted === false) return;
    state.scope.values.mounted = false;
    for (const [dep, listener] of state.dependencies || []) dep.removeListener(listener);
    state.dependencies?.clear();
    if (state.stateful && state.cls.methods.dispose) {
      try {
        state.scope.get('dispose')();
      } catch (error) {
        this.actionErrors.push(errorText(error));
      }
    }
  }
  withContext(context, fn) {
    const previous = this.currentContext;
    this.currentContext = context;
    try {
      return fn();
    } finally {
      this.currentContext = previous;
    }
  }
  buildState(state) {
    const previous = this.parentInstance;
    this.parentInstance = state.key;
    for (const [dep, listener] of state.dependencies) dep.removeListener(listener);
    state.dependencies.clear();
    try {
      state.dirty = false;
      const context = new PreviewContext(state.context.providers, state.context.inherited, state);
      state.scope.values.context = context;
      const built = this.withContext(context, () =>
        this.refreshTree(state.scope.get('build')(context)),
      );
      return {
        ...built,
        stateOwners: [state.key, ...(built?.stateOwners || [])],
        ...(state.componentNode ? { componentNode: state.componentNode } : {}),
      };
    } finally {
      this.parentInstance = previous;
    }
  }
  buildReactive(record) {
    const previous = this.parentInstance;
    this.parentInstance = record.key;
    try {
      record.dirty = false;
      return this.withContext(record.context, () =>
        this.refreshTree(record.builder(record.context, record.notifier.value, record.fixedChild)),
      );
    } finally {
      this.parentInstance = previous;
    }
  }
  listen(props, node) {
    if (!(props.valueListenable instanceof PreviewNotifier) || typeof props.builder !== 'function')
      throw new PreviewError('ValueListenableBuilder needs a ValueNotifier and a builder.');
    const route = this.currentRoute;
    if (route && !this.routeIds.has(route)) this.routeIds.set(route, ++this.nextRouteId);
    const site = `${this.parentInstance}/listen:${route ? this.routeIds.get(route) : 0}:${node.file}:${node.start}`;
    const occurrence = this.occurrences.get(site) ?? 0;
    this.occurrences.set(site, occurrence + 1);
    const key = `${site}:${props.key != null ? JSON.stringify(props.key) : occurrence}`;
    let record = this.reactiveInstances.get(key);
    if (record && record.notifier !== props.valueListenable) {
      record.notifier.removeListener(record.listener);
      this.reactiveInstances.delete(key);
      record = null;
    }
    if (!record) {
      record = { key, route, notifier: props.valueListenable };
      record.listener = () => {
        if (this.disposed) return;
        record.dirty = true;
        if (!this.notifierUpdateScheduled) {
          this.notifierUpdateScheduled = true;
          const epoch = this.epoch;
          queueMicrotask(() => {
            this.notifierUpdateScheduled = false;
            if (!this.disposed && epoch === this.epoch) this.onChange();
          });
        }
      };
      record.notifier.addListener(record.listener);
      this.reactiveInstances.set(key, record);
    }
    record.builder = props.builder;
    record.fixedChild = props.child ?? null;
    record.context = this.currentContext;
    record.child = this.buildReactive(record);
    this.renderedReactive.add(key);
    return {
      widget: 'ValueListenableBuilder',
      args: [],
      props: { child: record.child },
      node,
      reactiveKey: key,
    };
  }
  reset({ shared = true, notify = true } = {}) {
    this.cancelPending();
    this.instances.clear();
    this.routeTrees.clear();
    this.stack = [];
    this.routeResults = new Map();
    this.routeOptions = new Map();
    this.navigation = null;
    this.heroTags = new Map();
    this.nextHeroId = 0;
    this.routeChrome = new Map();
    this.pendingChrome = null;
    this.systemUIStyle = null;
    if (shared) for (const value of this.appState.values()) value.set(value.initial);
    this.graph.dispose();
    this.graph = new ReactiveGraph();
    this.classScopes.clear();
    this.notifierObjects = new WeakMap();
    this.global = new Env();
    this.currentContext = new PreviewContext();
    this.registeredRoutes = {};
    this.startupPending = false;
    this.errors = [];
    this.logs = [];
    this.actionErrors = [];
    this.steps = 0;
    this.numericDeadline = null;
    this.depth = 0;
    this.initialize();
    this.initializationErrors = [...this.errors];
    if (notify) this.onChange();
  }
  back() {
    if (this.overlays.length) {
      const name = this.overlays.at(-1).name;
      if (name !== 'showAlert') this.completeOverlay(name === 'showActionSheet' ? -1 : null);
      return;
    }
    this.popRoute();
    this.onChange();
  }
  pushRoute(builder, props = {}) {
    const options = routeOptions(props);
    this.routeOptions.set(builder, options);
    this.navigation = { type: 'push', ...options };
    this.routeChrome.set(builder, this.systemUIStyle);
    this.stack.push(builder);
    const result = new Promise((resolve) => this.routeResults.set(builder, resolve));
    this.scheduleChange();
    return result;
  }
  routeFuture(promise) {
    const epoch = this.epoch;
    return new DartFuture(
      promise,
      () => !this.disposed && this.epoch === epoch,
      (fn) => {
        this.cleanups.add(fn);
        return () => this.cleanups.delete(fn);
      },
    );
  }
  popRoute(result = null) {
    const route = this.stack.pop();
    if (route) {
      this.navigation = { type: 'pop', ...this.routeOptions.get(route) };
      this.routeOptions.delete(route);
      this.pendingChrome = { style: this.routeChrome.get(route) };
      this.routeChrome.delete(route);
      this.routeResults.get(route)?.(result);
      this.routeResults.delete(route);
    }
  }
  action(fn, ...args) {
    return this.runAction(fn, args);
  }
  runAction(fn, args, notify = true) {
    this.audio?.unlock();
    this.steps = 0;
    this.numericDeadline = null;
    this.depth = 0;
    this.actionErrors = [];
    try {
      if (typeof fn !== 'function') throw new PreviewError('This callback is not supported.');
      const result = fn(...args);
      if (result instanceof Promise) {
        const epoch = this.epoch;
        return result
          .catch((e) => {
            if (epoch === this.epoch && !this.disposed) {
              this.logs.push(errorText(e));
              this.actionErrors.push(errorText(e));
            }
          })
          .finally(() => {
            if (epoch === this.epoch && !this.disposed) this.onChange();
          });
      }
    } catch (e) {
      this.logs.push(errorText(e));
      this.actionErrors.push(errorText(e));
    }
    if (notify) this.onChange();
  }
  cancelPending() {
    this.epoch++;
    this.firebase?.dispose();
    this.maps?.dispose();
    this.social?.dispose();
    for (const resolve of this.routeResults.values()) resolve(null);
    this.routeResults.clear();
    this.speech?.dispose();
    this.audio?.dispose();
    this.fileAudio?.dispose();
    this.camera?.dispose();
    this.notifications?.dispose();
    this.services?.dispose();
    this.storage?.dispose();
    this.videos?.dispose();
    this.gestures?.dispose();
    this.lottie?.dispose();
    this.canvas?.dispose();
    this.futures?.dispose();
    this.images?.dispose();
    this.network?.dispose();
    for (const collection of this.virtualCollections.values()) collection.dispose();
    this.virtualCollections.clear();
    for (const record of this.reactiveInstances.values())
      record.notifier.removeListener(record.listener);
    this.reactiveInstances.clear();
    for (const state of this.instances.values()) this.disposeInstance(state);
    this.viewport?.dispose();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.clear();
    for (const overlay of this.overlays.splice(0)) overlay.resolve(null);
    this.uiState.clear();
  }
  dispose() {
    this.cancelPending();
    this.graph.dispose();
    this.disposed = true;
  }
  postFrame(fn) {
    const epoch = this.epoch;
    let id;
    const cleanup = () => {
      frameClock.cancel(id);
      this.cleanups.delete(cleanup);
    };
    id = frameClock.request((time) => {
      this.cleanups.delete(cleanup);
      if (epoch === this.epoch && !this.disposed)
        this.action(fn, { valueType: 'Duration', args: [], props: { microseconds: time * 1000 } });
    });
    this.cleanups.add(cleanup);
    return null;
  }
  timer(duration, fn, { periodic = false } = {}) {
    const ms = durationMilliseconds(duration);
    if (!Number.isFinite(ms) || ms < 0 || ms > 2147483647)
      throw new PreviewError('Invalid timer duration.');
    const epoch = this.epoch;
    let id;
    const timer = {
      isActive: true,
      tick: 0,
      cancel: () => {
        timer.isActive = false;
        (periodic ? clearInterval : clearTimeout)(id);
        this.cleanups.delete(timer.cancel);
      },
    };
    const fire = () => {
      if (epoch !== this.epoch || this.disposed) {
        timer.cancel();
        return;
      }
      timer.tick++;
      if (!periodic) timer.cancel();
      this.action(fn, ...(periodic ? [timer] : []));
    };
    id = (periodic ? setInterval : setTimeout)(fire, Math.max(periodic ? 1 : 0, ms));
    this.cleanups.add(timer.cancel);
    return timer;
  }
  present(name, props) {
    if (this.overlays.length >= 4) throw new PreviewError('Preview overlay limit reached.');
    const promise = new Promise((resolve) => this.overlays.push({ name, props, resolve }));
    this.onChange();
    return promise;
  }
  completeOverlay(result) {
    this.overlays.pop()?.resolve(result);
    this.onChange();
  }
  async evalAsync(n, env, epoch) {
    if (this.disposed || this.epoch !== epoch)
      throw new PreviewError('Preview action was cancelled after a source change or reset.');
    this.tick();
    if (n == null) return null;
    if (n.kind === 'await') {
      const value = await unwrapFuture(await this.evalAsync(n.value, env, epoch));
      if (this.disposed || this.epoch !== epoch)
        throw new PreviewError('Preview action was cancelled.');
      this.steps = 0;
      this.numericDeadline = null;
      return value;
    }
    if (n.kind === 'block') {
      const local = new Env({}, env);
      for (const statement of n.statements) {
        const value = await this.evalAsync(statement, local, epoch);
        if (value instanceof Completion) return value;
      }
      return null;
    }
    if (n.kind === 'try') {
      let result;
      try {
        result = await this.evalAsync(n.body, env, epoch);
      } catch (error) {
        if (error instanceof LimitError || epoch !== this.epoch || this.disposed) throw error;
        const match = n.catches
          .map((c) => ({ c, scope: catchScope(this, c, error, env) }))
          .find((x) => x.scope);
        if (!match) throw error;
        result = await this.evalAsync(match.c.body, match.scope, epoch);
      } finally {
        if (n.finally) {
          const final = await this.evalAsync(n.finally, env, epoch);
          if (final instanceof Completion) return final;
        }
      }
      return result;
    }
    if (n.kind === 'variables') {
      for (const entry of n.entries)
        env.values[entry.name] = await this.evalAsync(entry.value, env, epoch);
      return null;
    }
    if (n.kind === 'patternDeclaration') {
      if (!bindPattern(this, n.pattern, await this.evalAsync(n.value, env, epoch), env))
        throw new PreviewError('Value does not match its declaration pattern.');
      return null;
    }
    if (n.kind === 'return') return new ReturnValue(await this.evalAsync(n.value, env, epoch));
    if (n.kind === 'loop' || n.kind === 'forElement') return runLoopAsync(this, n, env, epoch);
    if (n.kind === 'ifElement') {
      const selected = (await this.evalAsync(n.condition, env, epoch)) ? n.yes : n.no;
      if (!selected) return [];
      const value = await this.evalAsync(selected, env, epoch);
      return ['spread', 'forElement', 'ifElement'].includes(selected.kind) ? value : [value];
    }
    if (n.kind === 'list') {
      const result = [];
      for (const item of n.items) {
        const value = await this.evalAsync(item, env, epoch);
        if (['spread', 'forElement', 'ifElement'].includes(item.kind)) result.push(...value);
        else result.push(value);
      }
      return result;
    }
    if (n.kind === 'record') {
      const record = [],
        named = Object.create(null);
      for (const field of n.fields) {
        const value = await this.evalAsync(field.value, env, epoch);
        if (field.name) named[field.name] = value;
        else record.push(value);
      }
      return { record, named };
    }
    if (n.kind === 'switch') {
      const value = await this.evalAsync(n.value, env, epoch);
      for (const branch of n.cases) {
        const scope = new Env({}, env);
        if (
          bindPattern(this, branch.pattern, value, scope) &&
          (!branch.guard || (await this.evalAsync(branch.guard, scope, epoch)))
        ) {
          const result = await this.evalAsync(branch.body, scope, epoch);
          return result instanceof LoopFlow && result.kind === 'break' ? null : result;
        }
      }
      return null;
    }
    if (n.kind === 'if' || n.kind === 'conditional')
      return this.evalAsync(
        (await this.evalAsync(n.condition, env, epoch)) ? n.yes : n.no,
        env,
        epoch,
      );
    if (
      (n.kind === 'prefix' && ['++', '--'].includes(n.op)) ||
      (n.kind === 'postfix' && ['++', '--'].includes(n.op))
    ) {
      const node = { ...n.value };
      for (const key of ['target', 'index'])
        if (node[key])
          node[key] = { kind: 'literal', value: await this.evalAsync(node[key], env, epoch) };
      const reference = this.reference(node, env),
        before = reference.get(),
        after = before + (n.op === '++' ? 1 : -1);
      reference.set(after);
      return n.kind === 'prefix' ? after : before;
    }
    if (n.kind === 'assign') {
      const left = { ...n.left };
      for (const key of ['target', 'index'])
        if (
          left[key] &&
          !(key === 'target' && left[key].kind === 'ref' && left[key].name === 'this')
        )
          left[key] = { kind: 'literal', value: await this.evalAsync(left[key], env, epoch) };
      const reference = this.reference(left, env),
        before = n.op === '=' ? undefined : reference.get();
      if (n.op === '??=' && before != null) return before;
      return reference.set(
        this.assignmentValue(n.op, before, await this.evalAsync(n.right, env, epoch)),
      );
    }
    if (n.kind === 'binary' && ['&&', '||', '??'].includes(n.op)) {
      const value = await this.evalAsync(n.left, env, epoch);
      if ((n.op === '&&' && !value) || (n.op === '||' && value) || (n.op === '??' && value != null))
        return value;
      return this.evalAsync(n.right, env, epoch);
    }
    // Preserve callbacks as closures. Resolve expression operands in Dart order.
    if (n.kind === 'lambda') return this.eval(n, env);
    const literal = (value) => ({ kind: 'literal', value });
    const copy = { ...n };
    const operands = {
      get: ['target'],
      index: ['target', 'index'],
      prefix: ['value'],
      binary: ['left', 'right'],
      assign: ['right'],
      call: ['target'],
      invoke: ['target'],
      cast: ['value'],
      is: ['value'],
      throw: ['value'],
      spread: ['value'],
    };
    for (const key of operands[n.kind] || [])
      if (n[key]) copy[key] = literal(await this.evalAsync(n[key], env, epoch));
    for (const key of ['args', 'parts'])
      if (n[key]) {
        copy[key] = [];
        for (const value of n[key])
          copy[key].push(literal(await this.evalAsync(value, env, epoch)));
      }
    if (n.named) {
      copy.named = {};
      for (const [key, value] of Object.entries(n.named))
        copy.named[key] = literal(await this.evalAsync(value, env, epoch));
    }
    return this.eval(copy, env);
  }
  run(body, env) {
    const result = this.eval(body, env);
    return result instanceof ReturnValue ? result.value : result;
  }
  eval(n, env = this.global) {
    this.tick();
    if (n == null) return null;
    switch (n.kind) {
      case 'literal':
        return n.value;
      case 'ref': {
        try {
          return env.get(n.name);
        } catch (error) {
          if (errorText(error) !== `Unresolved value: ${n.name}`) throw error;
          const uri = this.model.imports?.[n.file]?.[n.name];
          if (uri === 'dart:math') return symbol('@math');
          if (['package:dartnative/canvas.dart', 'dart:ui'].includes(uri)) return symbol('@canvas');
          throw error;
        }
      }
      case 'get': {
        const target = this.eval(n.target, env);
        return target == null && n.nullAware ? null : this.get(target, n.name);
      }
      case 'concat':
        return n.parts.map((x) => dartString(this.eval(x, env))).join('');
      case 'conditional':
        return this.eval(this.eval(n.condition, env) ? n.yes : n.no, env);
      case 'list': {
        let out = [];
        for (const x of n.items) {
          try {
            const v = this.eval(x, env);
            if (['forElement', 'spread', 'ifElement'].includes(x.kind)) out.push(...v);
            else out.push(v);
          } catch (e) {
            if (e instanceof LimitError) throw e;
            this.errors.push(errorText(e));
            out.push(wrapError(e, x));
          }
        }
        return out;
      }
      case 'ifElement': {
        const x = this.eval(n.condition, env) ? n.yes : n.no;
        return x == null
          ? []
          : ['spread', 'forElement', 'ifElement'].includes(x.kind)
            ? this.eval(x, env)
            : [this.eval(x, env)];
      }
      case 'loop':
      case 'forElement':
        return runLoop(this, n, env);
      case 'break':
      case 'continue':
        if (n.label) throw new PreviewError('Labeled loop control is not supported.');
        return new LoopFlow(n.kind);
      case 'switch': {
        const value = this.eval(n.value, env);
        for (const branch of n.cases) {
          const scope = new Env({}, env);
          if (
            bindPattern(this, branch.pattern, value, scope) &&
            (!branch.guard || this.eval(branch.guard, scope))
          ) {
            const result = this.eval(branch.body, scope);
            return result instanceof LoopFlow && result.kind === 'break' ? null : result;
          }
        }
        return null;
      }
      case 'throw':
        throw this.eval(n.value, env);
      case 'rethrow':
        throw env.get('$caught');
      case 'try': {
        let result;
        try {
          result = this.eval(n.body, env);
        } catch (error) {
          if (error instanceof LimitError) throw error;
          const match = n.catches
            .map((c) => ({ c, scope: catchScope(this, c, error, env) }))
            .find((x) => x.scope);
          if (!match) throw error;
          result = this.eval(match.c.body, match.scope);
        } finally {
          if (n.finally) {
            const final = this.eval(n.finally, env);
            if (final instanceof Completion) return final;
          }
        }
        return result;
      }
      case 'record': {
        const record = [],
          named = Object.create(null);
        for (const field of n.fields) {
          const value = this.eval(field.value, env);
          if (field.name) named[field.name] = value;
          else record.push(value);
        }
        return { record, named };
      }
      case 'spread':
        return this.eval(n.value, env) ?? [];
      case 'map': {
        if (n.set) return new Set(this.eval({ ...n, kind: 'list', items: n.entries }, env));
        const out = Object.create(null);
        const append = (e) => {
          if (e.kind === 'ifElement') {
            const selected = this.eval(e.condition, env) ? e.yes : e.no;
            if (selected) append(selected);
            return;
          }
          if (e.kind === 'spread') {
            Object.assign(out, this.eval(e.value, env));
            return;
          }
          const entries = e.kind === 'forElement' ? this.eval(e, env) : [this.eval(e, env)];
          for (const entry of entries) {
            if (!entry?.mapEntry) throw new PreviewError('Unsupported map element.');
            out[String(entry.key)] = entry.value;
          }
        };
        n.entries.forEach(append);
        return out;
      }
      case 'entry':
        return { mapEntry: true, key: this.eval(n.key, env), value: this.eval(n.value, env) };
      case 'index': {
        const x = this.eval(n.target, env),
          i = this.eval(n.index, env);
        if (x && Object.getPrototypeOf(x) === null) {
          this.safeKey(String(i));
          return Object.hasOwn(x, String(i)) ? x[i] : null;
        }
        return x instanceof DartListMap || x instanceof DartTypedList
          ? x.at(i)
          : this.get(x, String(i));
      }
      case 'cast': {
        const value = this.eval(n.value, env);
        if (!isDartType(this, value, n.type)) throw new PreviewError(`Value is not a ${n.type}.`);
        return value;
      }
      case 'is':
        return isDartType(this, this.eval(n.value, env), n.type) !== !!n.not;
      case 'cascade': {
        const target = this.eval(n.target, env);
        if (target == null && n.nullAware) return null;
        const local = new Env({ $cascade: target }, env);
        for (const section of n.sections) this.eval(section, local);
        return target;
      }
      case 'lambda': {
        const invoke = (args, named = {}) => {
          const local = n.parameters
            ? bindParameters(this, n.parameters, args, named, env)
            : new Env(Object.fromEntries(n.params.map((p, i) => [p, args[i]])), env);
          if (n.async) {
            const epoch = this.epoch;
            const pending = this.evalAsync(n.body, local, epoch).then((result) =>
              result instanceof ReturnValue ? result.value : result,
            );
            this.pending.add(pending);
            pending.then(
              () => {
                this.pending.delete(pending);
                if (epoch === this.epoch && !this.disposed) this.onChange();
              },
              (error) => {
                this.pending.delete(pending);
                if (epoch === this.epoch && !this.disposed) {
                  if (!this.actionErrors.includes(errorText(error)))
                    this.actionErrors.push(errorText(error));
                  this.onChange();
                }
              },
            );
            return pending;
          }
          if (++this.depth > 80) {
            this.depth--;
            throw new PreviewError('Preview call depth exceeded.');
          }
          try {
            return this.run(n.body, local);
          } finally {
            this.depth--;
          }
        };
        const fn = (...args) => invoke(args);
        fn[dartInvocation] = invoke;
        return fn;
      }
      case 'block': {
        const local = new Env({}, env);
        for (const s of n.statements) {
          const v = this.eval(s, local);
          if (v instanceof Completion) return v;
        }
        return null;
      }
      case 'return':
        return new ReturnValue(this.eval(n.value, env));
      case 'variables':
        for (const x of n.entries) env.values[x.name] = this.eval(x.value, env);
        return null;
      case 'patternDeclaration':
        if (!bindPattern(this, n.pattern, this.eval(n.value, env), env))
          throw new PreviewError('Value does not match its declaration pattern.');
        return null;
      case 'if':
        return this.eval(this.eval(n.condition, env) ? n.yes : n.no, env);
      case 'binary': {
        const a = this.eval(n.left, env);
        if (n.op === '&&') return a && this.eval(n.right, env);
        if (n.op === '||') return a || this.eval(n.right, env);
        if (n.op === '??') return a ?? this.eval(n.right, env);
        const b = this.eval(n.right, env);
        switch (n.op) {
          case '+':
            return a + b;
          case '-':
            return a - b;
          case '*':
            return a * b;
          case '/':
            return a / b;
          case '~/':
            return Math.trunc(a / b);
          case '%':
            return ((a % b) + Math.abs(b)) % Math.abs(b);
          case '==':
            return isSymbol(a) && isSymbol(b) ? a.symbol === b.symbol : a === b;
          case '!=':
            return isSymbol(a) && isSymbol(b) ? a.symbol !== b.symbol : a !== b;
          case '>':
            return a > b;
          case '<':
            return a < b;
          case '>=':
            return a >= b;
          case '<=':
            return a <= b;
          default:
            throw new PreviewError(`Unsupported operator ${n.op}`);
        }
      }
      case 'prefix': {
        if (['++', '--'].includes(n.op)) {
          const reference = this.reference(n.value, env);
          return reference.set(reference.get() + (n.op === '++' ? 1 : -1));
        }
        const v = this.eval(n.value, env);
        if (n.op === '!') return !v;
        if (n.op === '-') return -v;
        throw new PreviewError(`Unsupported prefix ${n.op}`);
      }
      case 'postfix': {
        const reference = this.reference(n.value, env),
          value = reference.get();
        if (n.op === '!') {
          if (value == null) throw new PreviewError('Null check operator used on a null value.');
          return value;
        }
        if (!['++', '--'].includes(n.op)) throw new PreviewError(`Unsupported postfix ${n.op}`);
        reference.set(value + (n.op === '++' ? 1 : -1));
        return value;
      }
      case 'assign': {
        const reference = this.reference(n.left, env),
          before = n.op === '=' ? undefined : reference.get();
        if (n.op === '??=' && before != null) return before;
        return reference.set(this.assignmentValue(n.op, before, this.eval(n.right, env)));
      }
      case 'invoke': {
        const fn = this.eval(n.target, env);
        if (typeof fn !== 'function') throw new PreviewError('Unsupported callable.');
        return fn(...n.args.map((x) => this.eval(x, env)));
      }
      case 'call':
        return this.call(n, env);
      default:
        throw new PreviewError(`Unsupported Dart: ${n.syntax ?? n.kind}`);
    }
  }
  reference(node, env) {
    const fixed = { ...node };
    for (const key of ['target', 'index'])
      if (
        fixed[key] &&
        !(key === 'target' && fixed[key].kind === 'ref' && fixed[key].name === 'this')
      )
        fixed[key] = { kind: 'literal', value: this.eval(fixed[key], env) };
    return { get: () => this.eval(fixed, env), set: (value) => this.assign(fixed, value, env) };
  }
  assignmentValue(op, before, value) {
    if (op === '=' || op === '??=') return value;
    if (op === '+=') return before + value;
    if (op === '-=') return before - value;
    throw new PreviewError(`Unsupported assignment ${op}`);
  }
  assign(n, value, env) {
    if (n.kind === 'ref') return env.set(n.name, value);
    if (n.kind === 'get') {
      const target = this.eval(n.target, env);
      this.safeKey(n.name);
      if (isSymbol(target) && target.symbol === 'SuperTonicTTS' && n.name === 'verboseLogging') {
        if (typeof value !== 'boolean') throw new PreviewError('verboseLogging needs a boolean.');
        this.speech.verbose = value;
        return value;
      }
      if (target instanceof DartObject) return target.set(n.name, value);
      if (target instanceof CanvasPaint) return target.write(n.name, value);
      if (target instanceof PreviewFileAudioPlayer && n.name === 'positionUpdateInterval') {
        const ms = durationMilliseconds(value);
        if (!Number.isFinite(ms) || ms < 16 || ms > 60000)
          throw new PreviewError('Audio position sampling must be between 16 ms and one minute.');
        target.positionUpdateInterval = value;
        return value;
      }
      if (isSymbol(target) && Object.hasOwn(this.model.classes, target.symbol)) {
        const scope = classScope(this, target.symbol);
        if (!scope.owns(n.name)) throw new PreviewError('Unknown static field.');
        return scope.set(n.name, value);
      }
      if (n.target?.kind === 'ref' && n.target.name === 'this') {
        for (let owner = env; owner; owner = owner.parent)
          if (
            owner.state &&
            target === owner.values &&
            Object.hasOwn(owner.state.cls.fields, n.name)
          ) {
            target[n.name] = value;
            return value;
          }
        throw new PreviewError('Only declared state fields can be assigned through this.');
      }
      if (
        (target instanceof PreviewNotifier || target instanceof PreviewSignal) &&
        n.name === 'value'
      )
        return target.set(value);
      if (target instanceof PreviewAnimationController && n.name === 'value') {
        target.value = value;
        return value;
      }
      if (target?.controller && n.name === 'text') {
        target.text = String(value);
        return target.text;
      }
      throw new PreviewError('Only controller.text property assignment is supported.');
    }
    if (n.kind === 'index') {
      const target = this.eval(n.target, env);
      if (target instanceof DartListMap) throw new PreviewError('List.asMap is read-only.');
      const i = this.eval(n.index, env);
      this.safeKey(String(i));
      if (target instanceof DartTypedList) return target.set(i, value);
      target[i] = value;
      return value;
    }
    throw new PreviewError('Only local state and list/map assignments are supported.');
  }
  safeKey(name) {
    if (['__proto__', 'prototype', 'constructor', 'call', 'apply', 'bind'].includes(name))
      throw new PreviewError('Property access is not allowed.');
  }
  get(value, name) {
    this.safeKey(name);
    if (
      value instanceof SocialValue ||
      value instanceof SocialException ||
      value instanceof PreviewGoogleSignIn
    )
      return value.read(name);
    if (value instanceof MapValue) return value.read(name);
    if (value instanceof FirebaseMessage) return value.read(name);
    if (value instanceof DartEnumValue) return value.read(name);
    if (value instanceof SpeechValue) return value.read(name);
    if (value instanceof PreviewFileAudioPlayer) return value.read(name);
    if (value instanceof PreviewCameraController) return value.read(name);
    if (value instanceof PreviewEventStream)
      throw new PreviewError(`Unsupported event stream property: ${name}`);
    if (value instanceof PreviewPcmPlayer) return value.read(name);
    if (
      value instanceof DartTypedList ||
      value instanceof DartByteData ||
      value instanceof DartByteBuffer
    )
      return value.read(name);
    if (value instanceof CanvasValue) return value.read(name);
    if (value instanceof DartListMap) return value.read(name);
    if (value instanceof DartObject) {
      if (value.scope.owns(name)) return value.get(name);
      for (const extension of this.model.extensions || [])
        if (isDartType(this, value, extension.type || 'dynamic')) {
          const member = extension.members.find((m) => m.name === name && !m.setter);
          if (member) {
            const fn = this.eval(member.function, new Env({ this: value }, this.global));
            return member.getter ? fn() : fn;
          }
        }
      throw new PreviewError(`Unsupported property: ${value.name}.${name}`);
    }
    if (value instanceof DartSuper) {
      const cls = this.model.classes[value.base],
        member = cls?.methods[name] || cls?.getters?.[name];
      if (member) {
        const fn = this.eval(member, value.object.scope);
        return cls.getters?.[name] ? fn() : fn;
      }
      const notifier = this.notifierObjects.get(value.object);
      if (
        notifier &&
        ['addListener', 'removeListener', 'notifyListeners', 'dispose'].includes(name)
      )
        return (...args) => notifier[name](...args);
      if (['initState', 'dispose', 'didChangeDependencies'].includes(name)) return () => null;
      throw new PreviewError(`Unsupported super member: ${name}`);
    }
    if (value?.enumNamespace) return enumMember(this, value, name);
    if (value?.enumType && ['name', 'index'].includes(name)) return value[name];
    if (
      ['ThemeData', 'ColorScheme', 'TextTheme', 'TextStyle', 'DNPreviewLocalizations'].includes(
        value?.valueType,
      ) &&
      Object.hasOwn(value.props, name)
    )
      return value.props[name];
    if (value?.record) {
      if (/^\$[1-9][0-9]*$/.test(name)) return value.record[Number(name.slice(1)) - 1];
      if (Object.hasOwn(value.named, name)) return value.named[name];
    }
    if (value instanceof PreviewTextController) {
      if (['text', 'selection'].includes(name)) return value[name];
    }
    if (value instanceof PreviewScrollController || value instanceof PreviewAnimationController)
      return value.read(name);
    if (value instanceof PreviewLottieController) return value.read(name);
    if (value instanceof PreviewVideoController) return value.read(name);
    if (
      value?.valueType === 'Duration' &&
      ['inMilliseconds', 'inSeconds', 'inMinutes', 'inHours', 'inMicroseconds'].includes(name)
    )
      return Math.trunc(
        durationMilliseconds(value) /
          {
            inMilliseconds: 1,
            inSeconds: 1000,
            inMinutes: 60000,
            inHours: 3600000,
            inMicroseconds: 0.001,
          }[name],
      );
    if (value?.valueType === 'Size' && ['width', 'height'].includes(name))
      return value.args[name === 'width' ? 0 : 1];
    if (value?.valueType === 'Offset' && ['dx', 'dy'].includes(name))
      return value.args[name === 'dx' ? 0 : 1];
    if (value?.valueType === 'Rect' && name === 'center')
      return {
        valueType: 'Offset',
        args: [(value.left + value.right) / 2, (value.top + value.bottom) / 2],
        props: {},
      };
    if (typeof value === 'string' && /^\d+$/.test(name)) {
      const index = Number(name);
      if (index >= value.length) throw new PreviewError('String index is outside the string.');
      return value[index];
    }
    if (isSymbol(value)) {
      if (value.symbol === 'FirebaseMessaging' && name.startsWith('on'))
        return this.firebase.read(name);
      if (value.symbol === 'DartNativeNotifications' && name === 'onTap') {
        this.notifications.check();
        return this.notifications.onTap;
      }
      if (value.symbol === 'HttpHeaders' && ['acceptHeader', 'acceptLanguageHeader'].includes(name))
        return name === 'acceptHeader' ? 'accept' : 'accept-language';
      if (
        name === 'value' &&
        value.symbol.startsWith('MapType.') &&
        mapTypes.includes(value.symbol.slice(8))
      )
        return mapTypes.indexOf(value.symbol.slice(8));
      if (name === 'values') {
        const entries = sdkEnumValues(value.symbol);
        if (entries) return entries.map((entry) => symbol(`${value.symbol}.${entry}`));
      }
      if (name === 'index' || name === 'name') {
        const [namespace, member, ...rest] = value.symbol.split('.'),
          entries = sdkEnumValues(namespace);
        if (!rest.length && entries?.includes(member))
          return name === 'index' ? entries.indexOf(member) : member;
      }
      if (value.symbol === '@canvas') return symbol(name);
      if (value.symbol === '@math') {
        const constants = {
          pi: Math.PI,
          e: Math.E,
          sqrt2: Math.SQRT2,
          sqrt1_2: Math.SQRT1_2,
          ln2: Math.LN2,
          ln10: Math.LN10,
          log2e: Math.LOG2E,
          log10e: Math.LOG10E,
        };
        if (Object.hasOwn(constants, name)) return constants[name];
        return symbol(`@math.${name}`);
      }
      const key = `${value.symbol}.${name}`;
      const speechValue = this.speech.read(key);
      if (speechValue !== undefined) return speechValue;
      const viewportValue = this.viewport.read(key);
      if (viewportValue !== undefined) return viewportValue;
      if (key === 'Duration.zero')
        return { valueType: 'Duration', args: [], props: { milliseconds: 0 } };
      if (key === 'VideoCacheConfig.none')
        return { valueType: 'VideoCacheConfig', args: [], props: { useCache: false } };
      if (key === 'SystemUiOverlayStyle.light' || key === 'SystemUiOverlayStyle.dark')
        return {
          valueType: 'SystemUiOverlayStyle',
          args: [],
          props: {
            statusBarBrightness: symbol(
              key.endsWith('.light') ? 'Brightness.dark' : 'Brightness.light',
            ),
          },
        };
      if (Object.hasOwn(this.model.classes, value.symbol)) {
        const scope = classScope(this, value.symbol);
        if (scope.owns(name)) return scope.get(name);
      }
      if (value.symbol === 'Colors') return colors[name] ?? symbol(key);
      if (key === 'double.infinity') return Infinity;
      if (key === 'Platform.resolvedExecutable') return '/preview/browser/runtime';
      if (key === 'Platform.isIOS') return true;
      if (key === 'Platform.isAndroid') return false;
      if (key === 'ProcessInfo.currentRss' || key === 'ProcessInfo.maxRss')
        throw new PreviewError(
          `${key} requires a native process. Browsers cannot provide an equivalent memory measurement.`,
        );
      return symbol(key);
    }
    if (
      value instanceof PreviewNotifier ||
      value instanceof PreviewSignal ||
      value instanceof PreviewComputed
    ) {
      if (name === 'value') return value.value;
      throw new PreviewError(`Unsupported notifier property: ${name}`);
    }
    if (value == null) throw new PreviewError(`Cannot read ${name} from null.`);
    if (value instanceof Date) {
      const fields = {
        year: value.getFullYear(),
        month: value.getMonth() + 1,
        day: value.getDate(),
        hour: value.getHours(),
        minute: value.getMinutes(),
        second: value.getSeconds(),
        millisecond: value.getMilliseconds(),
        millisecondsSinceEpoch: value.getTime(),
      };
      if (Object.hasOwn(fields, name)) return fields[name];
    }
    if (name === 'length' && (Array.isArray(value) || typeof value === 'string'))
      return value.length;
    if (typeof value === 'object' && Object.getPrototypeOf(value) === null) {
      if (name === 'entries') return Object.entries(value).map(([key, value]) => ({ key, value }));
      if (name === 'keys') return Object.keys(value);
      if (name === 'values') return Object.values(value);
    }
    if (
      value instanceof Set ||
      (typeof value === 'object' && Object.getPrototypeOf(value) === null)
    ) {
      const count = value instanceof Set ? value.size : Object.keys(value).length;
      if (name === 'length') return count;
      if (name === 'isEmpty') return count === 0;
      if (name === 'isNotEmpty') return count > 0;
    }
    if (name === 'isEmpty') return value.length === 0;
    if (name === 'isNotEmpty') return value.length > 0;
    if (name === 'isFinite' && typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'number' && ['isEven', 'isOdd'].includes(name)) {
      if (!Number.isInteger(value)) throw new PreviewError(`${name} needs an integer.`);
      return name === 'isEven' ? value % 2 === 0 : Math.abs(value % 2) === 1;
    }
    if (Array.isArray(value) && name === 'last') {
      if (!value.length) throw new PreviewError('No element in empty list.');
      return value.at(-1);
    }
    if (Array.isArray(value) && name === 'first') {
      if (!value.length) throw new PreviewError('No element in empty list.');
      return value[0];
    }
    if (name === 'text' && value.controller) return value.text;
    if (typeof value === 'object' && Object.hasOwn(value, name)) return value[name];
    throw new PreviewError(`Unsupported property: ${name}`);
  }
  call(n, env) {
    let name = n.name,
      target = null;
    if (n.target) {
      target = this.eval(n.target, env);
      if (target == null && n.nullAware) return null;
      if (isSymbol(target) && !(target instanceof DartEnumValue)) name = `${target.symbol}.${name}`;
    }
    const alias = this.model.imports?.[n.file]?.[name.split('.')[0]];
    if (name.startsWith('@canvas.')) name = name.slice(8);
    else if (['package:dartnative/canvas.dart', 'dart:ui'].includes(alias))
      name = name.split('.').slice(1).join('.');
    else if (alias === 'dart:math') name = '@math.' + name.split('.').slice(1).join('.');
    if (/^(Firebase|FirebaseMessaging)\./.test(name) && !firebaseCalls.has(name))
      throw new PreviewError(`${name} has no browser adapter yet.`);
    if (name.startsWith('DartNativeNotifications.') && !notificationCalls.has(name))
      throw new PreviewError(`${name} has no browser adapter yet.`);
    if (name === 'Provided') {
      const value = this.eval(n.named.value, env),
        type = n.typeArguments?.[0] || value?.name;
      return {
        widget: 'Provided',
        type,
        value,
        props: { child: this.eval(n.named.child, env) },
        args: [],
        node: n,
      };
    }
    // Unknown external widgets are opaque; do not execute their arguments or callbacks.
    const maybeWidget = /^(?:[A-Z]|_[A-Z])/.test(name.split('.')[0]);
    if (
      !n.target &&
      maybeWidget &&
      !widgetNames.has(name) &&
      !values.has(name) &&
      !canvasConstructors.has(name) &&
      !typedDataCalls.has(name) &&
      !['PcmStreamPlayer', 'AudioPlayer', 'AudioPlayerEventData'].includes(name) &&
      !browserServiceCalls.has(name) &&
      !storageCalls.has(name) &&
      !speechCalls.has(name) &&
      !cameraCalls.has(name) &&
      !mapCalls.has(name) &&
      !socialCalls.has(name) &&
      !notificationCalls.has(name) &&
      !firebaseCalls.has(name) &&
      !networkCalls.has(name) &&
      !imageCalls.has(name) &&
      !Object.hasOwn(this.model.classes, name.split('.')[0]) &&
      ![
        'DNPreviewScope',
        'Directionality',
        'DefaultTextStyle',
        'TextEditingController',
        'ValueNotifier',
        'ChangeNotifier',
        'ScrollController',
        'ListController',
        'FastListController',
        'FastGridController',
        'AnimationController',
        'LottieController',
        'VideoPlayerController',
        'Timer',
        'List.from',
        'List.of',
        'List.unmodifiable',
        'List.generate',
      ].includes(name)
    )
      return {
        widget: 'Unsupported',
        name: `${name}: no browser adapter`,
        node: n,
        args: [],
        props: {},
      };
    const args = n.args.map((x) => this.eval(x, env));
    const props = Object.fromEntries(
      Object.entries(n.named).map(([k, v]) => [k, this.eval(v, env)]),
    );
    if (['String.fromEnvironment', 'int.fromEnvironment', 'bool.fromEnvironment'].includes(name)) {
      if (
        args.length !== 1 ||
        typeof args[0] !== 'string' ||
        Object.keys(props).some((k) => k !== 'defaultValue')
      )
        throw new PreviewError('Environment constructors take a name and optional defaultValue.');
      const kind = name.split('.')[0],
        fallback = props.defaultValue ?? { String: '', int: 0, bool: false }[kind];
      if (
        (kind === 'String' && typeof fallback !== 'string') ||
        (kind === 'int' && !Number.isSafeInteger(fallback)) ||
        (kind === 'bool' && typeof fallback !== 'boolean')
      )
        throw new PreviewError('Invalid environment default value.');
      const value = Object.hasOwn(this.dartDefines, args[0]) ? this.dartDefines[args[0]] : null;
      return value == null
        ? fallback
        : kind === 'String'
          ? value
          : kind === 'bool'
            ? value === 'true'
              ? true
              : value === 'false'
                ? false
                : fallback
            : /^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value))
              ? Number(value)
              : fallback;
    }
    if (name.startsWith('@math.')) {
      const member = name.slice(6),
        arity = {
          min: 2,
          max: 2,
          pow: 2,
          atan2: 2,
          sin: 1,
          cos: 1,
          tan: 1,
          asin: 1,
          acos: 1,
          atan: 1,
          sqrt: 1,
          exp: 1,
          log: 1,
        };
      if (
        !Object.hasOwn(arity, member) ||
        args.length !== arity[member] ||
        Object.keys(props).length ||
        args.some((v) => typeof v !== 'number')
      )
        throw new PreviewError(`Unsupported dart:math call: ${member}.`);
      return Math[member](...args);
    }
    if (speechCalls.has(name)) return this.speech.invoke(name, args, props);
    if (socialCalls.has(name)) return this.social.invoke(name, args, props);
    if (mapCalls.has(name)) {
      checkSDKCall(name, args, props);
      return createMapValue(name, args, props);
    }
    if (cameraCalls.has(name)) return this.camera.invoke(name, args, props);
    if (name === 'AudioPlayer') {
      if (args.length || Object.keys(props).length)
        throw new PreviewError('AudioPlayer takes no arguments.');
      return this.fileAudio.create();
    }
    if (name === 'AudioPlayerEventData') {
      if (
        args.length !== 1 ||
        !['initialized', 'play', 'pause', 'completed', 'error'].some(
          (type) => args[0]?.symbol === `AudioPlayerEvent.${type}`,
        ) ||
        Object.keys(props).some((k) => k !== 'durationMs')
      )
        throw new PreviewError('Invalid audio event.');
      return { type: args[0], durationMs: props.durationMs ?? null };
    }
    if (name === 'unawaited') {
      if (args.length !== 1 || Object.keys(props).length)
        throw new PreviewError('unawaited needs one Future.');
      const promise = unwrapFuture(args[0]);
      if (promise != null && !(promise instanceof Promise))
        throw new PreviewError('unawaited needs a Future.');
      const epoch = this.epoch;
      promise?.catch((error) => {
        if (!this.disposed && this.epoch === epoch) {
          this.logs.push(errorText(error));
          this.actionErrors.push(errorText(error));
          this.scheduleChange();
        }
      });
      return null;
    }
    if (name === 'PcmStreamPlayer') {
      if (args.length || Object.keys(props).length)
        throw new PreviewError('PcmStreamPlayer takes no arguments.');
      return this.audio.create();
    }
    if (typedDataCalls.has(name)) return this.typedData.invoke(name, args, props);
    if (canvasConstructors.has(name)) {
      if (sdkSignature(name)) checkSDKCall(name, args, props);
      return this.canvas.value(name, args, props);
    }
    if (name === 'precacheImage') {
      if (args.length !== 1 || args[0]?.valueType !== 'NetworkImage' || Object.keys(props).length)
        throw new PreviewError('Browser precacheImage needs a NetworkImage.');
      const lease = this.images.acquire(args[0].args[0]);
      return lease.promise.then(() => null).finally(() => lease.release());
    }
    const [className, constructorName = ''] = name.split('.');
    if (Object.hasOwn(this.model.classes, className)) {
      const scope = classScope(this, className);
      if (constructorName && scope.owns(constructorName))
        return invokeDart(scope.get(constructorName), args, props);
      return this.instantiate(className, args, props, n, env, constructorName);
    }
    if (browserServiceCalls.has(name)) return this.services.invoke(name, args, props);
    if (notificationCalls.has(name)) return this.notifications.invoke(name, args, props);
    if (firebaseCalls.has(name)) return this.firebase.invoke(name, args, props);
    if (networkCalls.has(name)) return this.network.invoke(name, args, props);
    if (imageCalls.has(name)) return this.images.invoke(name, args, props);
    if (name === 'LottieController') {
      if (args.length || Object.keys(props).length)
        throw new PreviewError('LottieController takes no arguments.');
      const controller = new PreviewLottieController();
      this.cleanups.add(() => controller.dispose());
      return controller;
    }
    if (name === 'VideoPlayerController') {
      checkSDKCall(name, args, props);
      return this.videos.create(props);
    }
    if (name === 'Stopwatch') return createStopwatch();
    if (storageCalls.has(name)) return this.storage.invoke(name, args, props);
    if (name === 'ThemeData.dark' || name === 'ThemeData.light') {
      checkSDKCall(name, args, props);
      return {
        valueType: 'ThemeData',
        args: [],
        props: {
          ...this.defaultTheme(name === 'ThemeData.dark' ? 'dark' : 'light').props,
        },
      };
    }
    if (name === 'signal') return new PreviewSignal(this.graph, args[0], n.typeArguments?.[0]);
    if (name === 'computed') return new PreviewComputed(this.graph, args[0]);
    if (name === 'effect') return this.graph.effect(args[0]);
    if (name === 'ChangeNotifier') return new PreviewChangeNotifier(this.graph);
    if (
      ['ScrollController', 'ListController', 'FastListController', 'FastGridController'].includes(
        name,
      )
    )
      return new PreviewScrollController(this.graph, name, props);
    if (name === 'AnimationController')
      return new PreviewAnimationController(this.graph, props, (fn) => this.action(fn));
    if (name === 'Timer' || name === 'Timer.periodic')
      return this.timer(args[0], args[1], { periodic: name.endsWith('.periodic') });
    if (name === 'Future.delayed')
      return new Promise((resolve, reject) => {
        const ms = durationMilliseconds(args[0]);
        if (!Number.isFinite(ms) || ms < 0 || ms > 2147483647) {
          reject(new PreviewError('Invalid future delay.'));
          return;
        }
        const cleanup = () => {
          clearTimeout(id);
          this.cleanups.delete(cleanup);
          resolve(null);
        };
        const id = setTimeout(() => {
          this.cleanups.delete(cleanup);
          try {
            resolve(args[1]?.());
          } catch (error) {
            reject(error);
          }
        }, ms);
        this.cleanups.add(cleanup);
      });
    if (['Directionality', 'DNPreviewScope', 'DefaultTextStyle'].includes(name))
      return { widget: name, args, props, node: n };
    if (name === 'DNPreviewScope.maybeOf')
      return (args[0] || this.currentContext).inherited.get('DNPreviewScope') || null;
    if (name === 'Theme.of')
      return this.theme || this.defaultTheme(this.previewEnvironment?.brightness || 'light');
    if (name === 'ColorScheme.light' || name === 'ColorScheme.dark')
      return this.defaultTheme(name.endsWith('.dark') ? 'dark' : 'light').props.colorScheme;
    if (name === 'Directionality.of' || name === 'Directionality.maybeOf')
      return (
        (args[0] || this.currentContext).inherited.get('Directionality')?.textDirection ||
        symbol('TextDirection.' + (this.previewEnvironment?.textDirection || 'ltr'))
      );
    if (name === 'DefaultTextStyle.of')
      return (
        (args[0] || this.currentContext).inherited.get('DefaultTextStyle')?.style || {
          valueType: 'TextStyle',
          props: {},
        }
      );
    if (
      target?.valueType &&
      ['ThemeData', 'TextStyle', 'ColorScheme', 'TextTheme'].includes(target.valueType) &&
      n.name === 'copyWith'
    )
      return { ...target, props: { ...target.props, ...props } };
    if (name === 'Provided.of') {
      const type = n.typeArguments?.[0],
        context = args[0];
      if (!(context instanceof PreviewContext) || !context.providers.has(type))
        throw new PreviewError(`No Provided<${type}> ancestor.`);
      return context.providers.get(type);
    }
    if (target instanceof PreviewContext && n.name === 'dependOnInheritedWidgetOfExactType')
      return target.inherited.get(n.typeArguments?.[0]) ?? null;
    if (
      n.name === 'watch' &&
      (target instanceof PreviewNotifier ||
        target instanceof PreviewChangeNotifier ||
        this.notifierObjects.has(target))
    )
      return this.watch(target, args[0]);
    if (name === 'setAppBrightness') {
      this.brightness = args[0];
      return null;
    }
    if (name === 'SystemChrome.setSystemUIOverlayStyle') {
      this.systemUIStyle = args[0];
      return null;
    }
    if (name === 'SystemChrome.setPreferredOrientations') {
      this.viewport.setPreferred(args[0]);
      return null;
    }
    if (
      name === 'SystemChrome.setStatusBarColor' ||
      name === 'SystemChrome.setNavigationBarColor'
    ) {
      this.systemUIStyle = {
        ...this.systemUIStyle,
        valueType: 'SystemUiOverlayStyle',
        props: {
          ...this.systemUIStyle?.props,
          [name.includes('Status') ? 'statusBarColor' : 'systemNavigationBarColor']: args[0],
        },
      };
      return null;
    }
    if (name === 'registerRoutes') {
      this.registeredRoutes = { ...this.registeredRoutes, ...args[0] };
      return null;
    }
    if (name === 'DartNativePluginRegistrant.registerAll') return null;
    if (name === 'DynamicColor.corePalette' || name === 'DynamicColor.colorScheme') {
      const scheme = name.endsWith('.colorScheme');
      if (
        args.length ||
        Object.keys(props).some((key) => !scheme || key !== 'brightness') ||
        (scheme && !['Brightness.light', 'Brightness.dark'].includes(props.brightness?.symbol))
      )
        throw new PreviewError(
          'DynamicColor.corePalette takes no arguments; colorScheme requires a Brightness.',
        );
      // iOS has no wallpaper-derived Material You palette, matching the SDK.
      // The browser cannot query an Android device palette either.
      return null;
    }
    if (name.startsWith('MediaQuery.')) {
      const context = args[0] ?? this.currentContext;
      if (context?.element) this.watch(this.viewport.metricsNotifier, context);
    }
    if (name === 'MediaQuery.paddingOf') return this.viewport.padding;
    if (name === 'MediaQuery.sizeOf') return this.viewport.size;
    if (name === 'MediaQuery.orientationOf')
      return symbol(`Orientation.${this.viewport.landscape ? 'landscape' : 'portrait'}`);
    if (name === 'MediaQuery.of')
      return {
        size: this.viewport.size,
        padding: this.viewport.padding,
        orientation: symbol(`Orientation.${this.viewport.landscape ? 'landscape' : 'portrait'}`),
        viewInsets: { top: 0, bottom: 0, left: 0, right: 0 },
        devicePixelRatio: 3,
        platformBrightness: this.brightness || symbol('Brightness.light'),
        textScaleFactor: this.previewEnvironment?.textScaleFactor ?? 1,
        textDirection: symbol('TextDirection.' + (this.previewEnvironment?.textDirection || 'ltr')),
      };
    if (name === 'DateTime.now') return new Date();
    if (name === 'List.unmodifiable') return Object.freeze([...args[0]]);
    if (name === 'List.of' || name === 'List.from') return [...args[0]];
    if (name === 'List.generate') {
      if (!Number.isSafeInteger(args[0]) || args[0] < 0 || args[0] > 10000)
        throw new PreviewError('Invalid generated list length.');
      return Array.from({ length: args[0] }, (_, i) => {
        this.tick();
        return args[1](i);
      });
    }
    if (name === 'ValueNotifier') {
      checkSDKCall(name, args, props);
      return new PreviewNotifier(args[0], n.typeArguments?.[0]);
    }
    if (name === 'ValueListenableBuilder') {
      checkSDKCall(name, args, props, { preview: true });
      return this.listen(props, n);
    }
    if (widgetNames.has(name)) {
      checkSDKCall(name, args, props, { preview: true });
      if (name === 'FutureBuilder')
        return {
          widget: name,
          args,
          props,
          node: n,
          buildContext: this.currentContext,
          parentInstance: this.parentInstance,
        };
      if (name === 'Positioned.fill')
        return {
          widget: 'Positioned',
          args,
          props: { ...props, left: 0, top: 0, right: 0, bottom: 0 },
          node: n,
        };
      if (name.startsWith('SizedBox.'))
        return {
          widget: 'SizedBox',
          args,
          props: {
            ...props,
            width: name.endsWith('expand')
              ? Infinity
              : name.endsWith('square')
                ? props.dimension
                : 0,
            height: name.endsWith('expand')
              ? Infinity
              : name.endsWith('square')
                ? props.dimension
                : 0,
          },
          node: n,
        };
      return { widget: name, args, props, node: n };
    }
    if (values.has(name)) {
      if (sdkSignature(name)) checkSDKCall(name, args, props);
      if (name === 'Color.fromARGB' || name === 'Color.fromRGBO') {
        const channels = name.endsWith('ARGB')
          ? args
          : [Math.round(args[3] * 255), ...args.slice(0, 3)];
        if (channels.some((v) => !Number.isFinite(v)))
          throw new PreviewError('Color channels must be finite.');
        return {
          valueType: 'Color',
          args: [channels.reduce((n, v) => (n * 256 + (Math.trunc(v) & 255)) >>> 0, 0)],
          props: {},
        };
      }
      const value = { valueType: name, args, props };
      if (name === 'BoxShadow') boxShadows([value]);
      if (name === 'BoxDecoration') boxShadows(props.boxShadow);
      return value;
    }
    if (hostFunctions.has(name)) {
      checkSDKCall(name, args, props);
      return this.present(name, props);
    }
    if (name === 'TextEditingController')
      return new PreviewTextController(this.graph, props.text ?? '');
    if (name === 'super.initState' || name === 'super.dispose') return null;
    if (!n.target && name === 'identical') return Object.is(args[0], args[1]);
    if (name === 'double.tryParse' || name === 'int.tryParse') {
      const value = String(args[0]).trim();
      const valid =
        name === 'int.tryParse'
          ? /^[+-]?\d+$/.test(value)
          : /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value);
      if (!valid) return null;
      return Number(value);
    }
    if (name === 'setState') {
      args[0]?.();
      for (let owner = env; owner; owner = owner.parent)
        if (owner.state) {
          owner.state.dirty = true;
          break;
        }
      this.scheduleChange();
      return null;
    }
    if (name === 'print' || name === 'dnLog') {
      this.logs.push(String(args[0]));
      return null;
    }
    if (name === 'Navigator.pushNamed') {
      if (this.registeredRoutes?.[args[1]]) {
        const builder = this.registeredRoutes[args[1]];
        return this.routeFuture(this.pushRoute(() => builder(this.currentContext)));
      }
      const route = Object.hasOwn(this.model.routes, args[1]) ? this.model.routes[args[1]] : null;
      if (!route) throw new PreviewError(`Unknown route ${args[1]}`);
      return this.routeFuture(this.pushRoute(() => this.eval(route, this.global)()));
    }
    if (name === 'Navigator.push') {
      const route = args[1];
      if (!route?.props?.builder) throw new PreviewError('Unsupported page route.');
      return this.routeFuture(this.pushRoute(() => route.props.builder(null), route.props));
    }
    if (name === 'Navigator.pop') {
      if (this.overlays.length) {
        this.completeOverlay(args[1] ?? null);
        return null;
      }
      this.popRoute(args[1] ?? null);
      return null;
    }
    if (name === 'Navigator.canPop') return this.stack.length > 0;
    if (target != null && (!isSymbol(target) || target instanceof DartEnumValue)) {
      if (typeof target === 'function' && n.name === 'call') return invokeDart(target, args, props);
      this.safeKey(n.name);
      if (target?.enumNamespace) return invokeDart(enumMember(this, target, n.name), args, props);
      if (target instanceof DartEnumValue) return target.invoke(n.name, args, props);
      if (target instanceof DartListMap) return target.invoke(n.name, args);
      if (target instanceof DartObject || target instanceof DartSuper)
        return invokeDart(this.get(target, n.name), args, props);
      if (target instanceof SpeechValue) return target.invoke(n.name, args, props);
      if (target instanceof PreviewFileAudioPlayer || target instanceof PreviewEventStream)
        return target.invoke(n.name, args, props);
      if (target instanceof PreviewGoogleSignIn) return target.invoke(n.name, args, props);
      if (target instanceof PreviewCameraController) return target.invoke(n.name, args, props);
      if (target instanceof DartFuture) return target.invoke(n.name, args, props);
      if (target instanceof PreviewPcmPlayer) return target.invoke(n.name, args, props);
      if (
        target instanceof DartTypedList ||
        target instanceof DartByteData ||
        target instanceof DartByteBuffer
      )
        return target.invoke(n.name, args, props);
      if (target instanceof CanvasValue) return target.invoke(n.name, args, props);
      if (target instanceof PreviewLottieController) return target.invoke(n.name, args, props);
      if (target instanceof PreviewVideoController) return target.invoke(n.name, args, props);
      if (
        (target instanceof PreviewScrollController ||
          target instanceof PreviewAnimationController) &&
        !['addListener', 'removeListener', 'notifyListeners', 'dispose'].includes(n.name)
      )
        return target.invoke(n.name, args, props);
      if (target instanceof PreviewSignal && n.name === 'update') return target.update(args[0]);
      if (target instanceof PreviewTextController && n.name === 'clear') return target.clear();
      if (target instanceof PreviewChangeNotifier) {
        if (['addListener', 'removeListener', 'notifyListeners', 'dispose'].includes(n.name))
          return target[n.name](...args);
        throw new PreviewError(`Unsupported listenable method: ${n.name}`);
      }
      if (target instanceof PreviewNotifier) {
        if (['addListener', 'removeListener', 'dispose'].includes(n.name))
          return target[n.name](...args);
        throw new PreviewError(`Unsupported notifier method: ${n.name}`);
      }
      // Widget callback fields are closures created by this interpreter.
      if (
        typeof target === 'object' &&
        Object.hasOwn(target, n.name) &&
        typeof target[n.name] === 'function'
      )
        return invokeDart(target[n.name], args, props);
      if (n.name === 'toString') return dartString(target);
      if (
        n.name === 'withOpacity' &&
        (target?.valueType === 'Color' ||
          (typeof target === 'string' && /^#[0-9a-f]{6}$/i.test(target)))
      ) {
        const argb =
          target.valueType === 'Color'
            ? target.args[0] >>> 0
            : Number.parseInt(target.slice(1), 16);
        return {
          valueType: 'Color',
          args: [
            (Math.round(Math.max(0, Math.min(1, args[0])) * 255) * 0x1000000 +
              (argb & 0xffffff)) >>>
              0,
          ],
          props: {},
        };
      }
      if (n.name === 'toUpperCase' && typeof target === 'string') return target.toUpperCase();
      if (n.name === 'toLowerCase' && typeof target === 'string') return target.toLowerCase();
      if (n.name === 'trim' && typeof target === 'string') return target.trim();
      if (n.name === 'startsWith' && typeof target === 'string') {
        const index = args[1] ?? 0;
        if (
          args.length < 1 ||
          args.length > 2 ||
          Object.keys(props).length ||
          typeof args[0] !== 'string'
        )
          throw new PreviewError('String.startsWith needs a string and an optional index.');
        if (!Number.isInteger(index) || index < 0 || index > target.length)
          throw new PreviewError('String.startsWith index is outside the string.');
        return target.startsWith(args[0], index);
      }
      if (n.name === 'substring' && typeof target === 'string') {
        const start = args[0],
          end = args[1] ?? target.length;
        if (
          args.length < 1 ||
          args.length > 2 ||
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          start < 0 ||
          end < start ||
          end > target.length
        )
          throw new PreviewError('String.substring range is outside the string.');
        return target.slice(start, end);
      }
      if (n.name === 'codeUnitAt' && typeof target === 'string') {
        if (
          args.length !== 1 ||
          !Number.isInteger(args[0]) ||
          args[0] < 0 ||
          args[0] >= target.length
        )
          throw new PreviewError('String.codeUnitAt index is outside the string.');
        return target.charCodeAt(args[0]);
      }
      if (['padLeft', 'padRight'].includes(n.name) && typeof target === 'string') {
        const width = args[0],
          padding = args[1] ?? ' ';
        if (!Number.isSafeInteger(width) || width > 100000 || typeof padding !== 'string')
          throw new PreviewError('Invalid string padding.');
        const extra = padding.repeat(Math.max(0, width - target.length));
        return n.name === 'padLeft' ? extra + target : target + extra;
      }
      if (n.name === 'toStringAsFixed' && typeof target === 'number')
        return target.toFixed(args[0]);
      if (typeof target === 'number') {
        if (n.name === 'remainder') {
          if (args.length !== 1 || typeof args[0] !== 'number')
            throw new PreviewError('remainder needs a number.');
          return target % args[0];
        }
        if (n.name === 'toDouble') return target;
        if (n.name === 'abs') return Math.abs(target);
        if (n.name === 'clamp') {
          if (typeof args[0] !== 'number' || typeof args[1] !== 'number' || args[0] > args[1])
            throw new PreviewError('Invalid numeric clamp bounds.');
          return Math.max(args[0], Math.min(args[1], target));
        }
        if (['round', 'roundToDouble', 'floor', 'ceil', 'toInt'].includes(n.name)) {
          if (!Number.isFinite(target))
            throw new PreviewError('Cannot convert a non-finite number to an integer.');
          return n.name === 'round' || n.name === 'roundToDouble'
            ? Math.sign(target) * Math.floor(Math.abs(target) + 0.5)
            : n.name === 'floor'
              ? Math.floor(target)
              : n.name === 'ceil'
                ? Math.ceil(target)
                : Math.trunc(target);
        }
      }
      if (target instanceof Date && n.name === 'difference') {
        if (args.length !== 1 || !(args[0] instanceof Date))
          throw new PreviewError('DateTime.difference needs another DateTime.');
        return {
          valueType: 'Duration',
          args: [],
          props: { milliseconds: target.getTime() - args[0].getTime() },
        };
      }
      if (n.name === 'contains' && (typeof target === 'string' || Array.isArray(target)))
        return target.includes(args[0]);
      if (Array.isArray(target)) {
        if (n.name === 'asMap') return new DartListMap(target);
        if (n.name === 'indexWhere')
          return target.findIndex((value, index) => index >= (args[1] ?? 0) && args[0](value));
        if (n.name === 'insert') {
          target.splice(args[0], 0, args[1]);
          return null;
        }
        if (n.name === 'removeLast') {
          if (!target.length) throw new PreviewError('No element in empty list.');
          return target.pop();
        }
        if (n.name === 'clear') {
          target.length = 0;
          return null;
        }
        if (n.name === 'addAll') {
          target.push(...args[0]);
          return null;
        }
        if (n.name === 'add') {
          target.push(args[0]);
          return null;
        }
        if (n.name === 'remove') {
          const i = target.indexOf(args[0]);
          if (i >= 0) target.splice(i, 1);
          return i >= 0;
        }
        if (n.name === 'map') return target.map((x, i) => args[0](x, i));
        if (n.name === 'where') return target.filter((x) => args[0](x));
        if (n.name === 'any') return target.some((x) => args[0](x));
        if (n.name === 'every') return target.every((x) => args[0](x));
        if (n.name === 'skip') {
          if (!Number.isInteger(args[0]) || args[0] < 0)
            throw new PreviewError('Iterable.skip needs a nonnegative count.');
          return target.slice(args[0]);
        }
        if (n.name === 'fold') return target.reduce((sum, x) => args[1](sum, x), args[0]);
        if (n.name === 'firstWhere') {
          for (const item of target) if (args[0](item)) return item;
          if (props.orElse) return props.orElse();
          throw new PreviewError('No matching element.');
        }
        if (n.name === 'removeWhere') {
          for (let i = target.length - 1; i >= 0; i--) {
            this.tick();
            if (args[0](target[i])) target.splice(i, 1);
          }
          return null;
        }
        if (n.name === 'toList') return [...target];
        if (n.name === 'join') return target.map((value) => dartString(value)).join(args[0] ?? '');
      }
      if (
        typeof target === 'object' &&
        Object.getPrototypeOf(target) === null &&
        n.name === 'clear'
      ) {
        for (const key of Object.keys(target)) delete target[key];
        return null;
      }
      if (target.controller && n.name === 'clear') {
        target.text = '';
        return null;
      }
      throw new PreviewError(`Unsupported method: ${n.name}`);
    }
    try {
      const fn = env.get(name);
      if (typeof fn === 'function') return invokeDart(fn, args, props);
    } catch (e) {
      if (!errorText(e).startsWith('Unresolved value')) throw e;
    }
    throw new PreviewError(`Unsupported call: ${name}`);
  }
  isSubclass(name, base) {
    for (let current = name; current; current = baseType(this.model.classes[current]?.base))
      if (current === base) return true;
    return false;
  }
  instantiate(name, args, props, node, parent, constructor = '') {
    if (++this.depth > 80) {
      this.depth--;
      throw new PreviewError('Recursive constructor limit reached.');
    }
    try {
      const cls = this.model.classes[name];
      const widget = createDartObject(this, name, args, props, constructor);
      if (!(widget instanceof DartObject)) return widget;
      const stateful = this.isSubclass(name, 'StatefulWidget');
      if (
        !stateful &&
        !this.isSubclass(name, 'StatelessWidget') &&
        !this.isSubclass(name, 'InheritedWidget')
      )
        return widget;
      // Construct widgets in Dart order, but build them only once they are
      // mounted under their parent. Context belongs to the element tree.
      return { widget: 'DartWidget', object: widget, node, props: {}, args: [] };
    } finally {
      this.depth--;
    }
  }
  mountWidget(element) {
    if (++this.depth > 80) {
      this.depth--;
      throw new PreviewError('Recursive widget limit reached.');
    }
    try {
      const widget = element.object,
        name = widget.name,
        node = element.node,
        cls = this.model.classes[name];
      if (this.isSubclass(name, 'InheritedWidget')) {
        const inherited = new Map(this.currentContext.inherited);
        inherited.set(name, widget);
        return this.withContext(new PreviewContext(this.currentContext.providers, inherited), () =>
          this.refreshTree(widget.get('child')),
        );
      }
      const stateful = this.isSubclass(name, 'StatefulWidget');
      const route = this.currentRoute;
      if (route && !this.routeIds.has(route)) this.routeIds.set(route, ++this.nextRouteId);
      const site = `${this.parentInstance}/${route ? this.routeIds.get(route) : 0}:${node.file}:${node.previewSite ?? node.start}:${name}`;
      const occurrence = this.occurrences.get(site) ?? 0;
      this.occurrences.set(site, occurrence + 1);
      const widgetKey = widget.scope.owns('key') ? widget.get('key') : null;
      const key = `${site}:${widgetKey != null ? JSON.stringify(widgetKey) : occurrence}`;
      let state = this.instances.get(key);
      if (!state) {
        const instance = stateful ? invokeDart(widget.get('createState')) : widget;
        if (!(instance instanceof DartObject))
          throw new PreviewError(`Cannot resolve state for ${name}.`);
        state = {
          cls: this.model.classes[instance.name],
          scope: instance.scope,
          object: instance,
          route,
          key,
          stateful,
          dirty: true,
          initialized: false,
          dependencies: new Map(),
        };
        state.scope.state = state;
        this.instances.set(key, state);
      } else if (!stateful) {
        state.scope = widget.scope;
        state.scope.state = state;
        state.object = widget;
      }
      if (stateful) state.scope.values.widget = widget;
      state.scope.values.mounted = true;
      state.context = this.currentContext;
      state.componentNode = cls.libraryComponent ? node : null;
      this.renderedInstances.add(key);
      this.activateState(state);
      return this.buildState(state);
    } finally {
      this.depth--;
    }
  }
}
