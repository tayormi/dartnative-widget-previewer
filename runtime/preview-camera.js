import { PreviewEventStream } from './preview-events.js';
import { sdkEnumValues } from './preview-contract.js';
const enumName = (value, namespace) => {
  const name = value?.symbol?.split('.').at(-1);
  if (!sdkEnumValues(namespace)?.includes(name) || !value.symbol.startsWith(namespace + '.'))
    throw Error(`Invalid ${namespace}.`);
  return name;
};
const symbol = (namespace, name) => ({ symbol: `${namespace}.${name}` });
const stop = (stream) =>
  stream?.getTracks().forEach((track) => {
    if (track.readyState !== 'ended') track.stop();
  });
const resolution = {
  veryLow: 240,
  low: 360,
  medium: 480,
  high: 720,
  veryHigh: 1080,
  ultraHigh: 2160,
  max: 2160,
};
export const cameraCalls = new Set([
  'CameraController',
  'CameraDescription',
  'DartNativeCamera.availableCameras',
  'DartNativeCamera.requestGalleryAddPermission',
  'DartNativeCamera.requestMicrophonePermission',
]);
async function requestMedia(environment, constraints, cancellations, isDisposed) {
  const devices = environment.navigator?.mediaDevices;
  if (!devices?.getUserMedia)
    throw Error('Camera access requires a secure browser with media capture support.');
  let cancel,
    abandoned = false;
  const cancelled = new Promise((_, reject) => {
    cancel = () => {
      abandoned = true;
      reject(Error('Camera access was cancelled after the preview changed.'));
    };
  });
  cancellations.add(cancel);
  try {
    const request = devices.getUserMedia(constraints).then((stream) => {
      if (abandoned || isDisposed()) {
        stop(stream);
        throw Error('Camera access was cancelled after the preview changed.');
      }
      return stream;
    });
    return await Promise.race([request, cancelled]);
  } catch (error) {
    if (error.name === 'NotAllowedError')
      throw Error(
        'Camera or microphone permission denied. Change this site’s browser permissions to try again.',
      );
    throw error;
  } finally {
    cancellations.delete(cancel);
  }
}

export class PreviewCameraController {
  constructor(owner, description, preset, props) {
    this.owner = owner;
    this.runtime = owner.runtime;
    this.environment = owner.environment;
    this.description = description;
    this.resolutionPreset = preset;
    this.enableAudio = props.enableAudio ?? true;
    this.videoQuality = props.videoQuality ?? symbol('VideoQuality', 'hd');
    this.videoAspectRatio = props.videoAspectRatio ?? symbol('VideoAspectRatio', 'defaultRatio');
    this.videoBitRateBps = props.videoBitRateBps ?? 0;
    enumName(preset, 'ResolutionPreset');
    enumName(this.videoQuality, 'VideoQuality');
    enumName(this.videoAspectRatio, 'VideoAspectRatio');
    if (
      description?.cameraDescription !== true ||
      typeof this.enableAudio !== 'boolean' ||
      !Number.isInteger(this.videoBitRateBps) ||
      this.videoBitRateBps < 0
    )
      throw Error('Invalid camera controller settings.');
    this.disposed = false;
    this.isInitialized = false;
    this.isRecordingVideo = false;
    this.previewHandle = null;
    this.flashMode = symbol('FlashMode', 'off');
    this.orientation = 'portraitUp';
    this.listeners = new Set();
    this.observers = new Set();
    this.recordingEvents = new PreviewEventStream(this.runtime);
    this.cancellations = new Set();
    this.cleanups = [];
    this.capabilities = {};
    this.photoCapabilities = {};
    this.recording = null;
    this.video = null;
    this.stream = null;
  }
  check(ready = false) {
    if (this.disposed) throw Error('The camera controller was disposed.');
    if (ready && !this.isInitialized) throw Error('Initialize the camera before capturing.');
  }
  report(promise) {
    promise.catch((error) => {
      if (!this.disposed) {
        this.runtime.logs.push(error.message);
        this.runtime.actionErrors.push(error.message);
        this.runtime.scheduleChange();
      }
    });
    return null;
  }
  async acquire(constraints) {
    this.check();
    return requestMedia(this.environment, constraints, this.cancellations, () => this.disposed);
  }
  notify() {
    if (this.disposed) return;
    for (const listener of this.listeners) this.runtime.runAction(listener, [], false);
    for (const observer of this.observers) observer();
    this.runtime.scheduleChange();
  }
  async initialize() {
    this.check();
    if (this.isInitialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      const quality = {
          lowest: 'low',
          sd: 'medium',
          hd: 'high',
          fhd: 'veryHigh',
          uhd: 'ultraHigh',
          highest: 'max',
        }[enumName(this.videoQuality, 'VideoQuality')],
        height = Math.max(
          resolution[enumName(this.resolutionPreset, 'ResolutionPreset')],
          resolution[quality],
        );
      const video = { width: { ideal: Math.round((height * 16) / 9) }, height: { ideal: height } };
      if (this.description.name) video.deviceId = { exact: this.description.name };
      const stream = await this.acquire({ video, audio: false });
      this.stream = stream;
      try {
        this.check();
        const track = stream.getVideoTracks()[0];
        if (!track) throw Error('The browser returned no camera video track.');
        this.track = track;
        this.capabilities = track.getCapabilities?.() ?? {};
        const settings = track.getSettings?.() ?? {},
          facing = settings.facingMode;
        if (facing === 'user' || facing === 'environment')
          this.description.lensDirection = symbol(
            'CameraLensDirection',
            facing === 'user' ? 'front' : 'back',
          );
        if (settings.deviceId) this.description.name = settings.deviceId;
        await this.owner.refreshDescriptions(this.description);
        if (this.environment.ImageCapture) {
          try {
            this.imageCapture = new this.environment.ImageCapture(track);
            this.photoCapabilities = await this.imageCapture.getPhotoCapabilities();
          } catch {
            this.imageCapture = null;
          }
        }
        this.check();
        const element = this.environment.document.createElement('video');
        this.video = element;
        element.muted = true;
        element.playsInline = true;
        element.autoplay = true;
        element.srcObject = stream;
        await new Promise((resolve, reject) => {
          let timer;
          const done = (error) => {
              clearTimeout(timer);
              element.removeEventListener('loadeddata', ready);
              this.cancellations.delete(cancel);
              error ? reject(error) : resolve();
            },
            ready = () => done(),
            cancel = () => done(Error('Camera initialization cancelled.'));
          this.cancellations.add(cancel);
          element.addEventListener('loadeddata', ready, { once: true });
          timer = setTimeout(
            () => done(Error('The camera did not deliver a frame within 15 seconds.')),
            15000,
          );
          element.play().catch(done);
          if (element.readyState >= 2) done();
        });
        this.check();
        const ended = () => {
          if (this.disposed) return;
          this.isInitialized = false;
          this.abortRecording(Error('The camera stream ended.'));
          this.runtime.actionErrors.push(
            'The camera stream ended. Reopen the camera to reconnect.',
          );
          this.notify();
        };
        track.addEventListener('ended', ended);
        this.cleanups.push(() => track.removeEventListener('ended', ended));
        this.previewHandle = ++this.owner.nextHandle;
        this.isInitialized = true;
        this.notify();
      } catch (error) {
        stop(stream);
        this.stream = null;
        this.video?.pause();
        if (this.video) this.video.srcObject = null;
        this.video = null;
        throw error;
      }
    })();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }
  async takePicture() {
    this.check(true);
    if (this.capturing) throw Error('A photo capture is already running.');
    this.capturing = true;
    try {
      const mode = enumName(this.flashMode, 'FlashMode');
      let blob;
      if (this.imageCapture) {
        const fill = { always: 'flash', auto: 'auto', off: 'off' }[mode];
        blob = await this.imageCapture.takePhoto(fill ? { fillLightMode: fill } : {});
      } else {
        if (mode === 'always' || mode === 'auto')
          throw Error('Photo flash is unavailable on this browser camera.');
        const canvas = this.environment.document.createElement('canvas');
        canvas.width = this.video.videoWidth;
        canvas.height = this.video.videoHeight;
        if (!canvas.width || !canvas.height || canvas.width * canvas.height > 16_000_000)
          throw Error('Camera photo dimensions are unavailable or exceed 16 megapixels.');
        canvas.getContext('2d').drawImage(this.video, 0, 0);
        blob = await new Promise((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(Error('Photo encoding failed.'))),
            'image/jpeg',
            0.95,
          ),
        );
      }
      this.check();
      return this.owner.file(blob, blob.type === 'image/png' ? 'photo.png' : 'photo.jpg');
    } finally {
      this.capturing = false;
    }
  }
  async setFlash(mode) {
    this.check(true);
    const name = enumName(mode, 'FlashMode');
    if (name === 'torch') {
      if (!this.capabilities.torch) throw Error('Torch is unavailable on this browser camera.');
      await this.track.applyConstraints({ advanced: [{ torch: true }] });
    } else {
      if (
        name !== 'off' &&
        !this.photoCapabilities.fillLightMode?.includes(name === 'always' ? 'flash' : 'auto')
      )
        throw Error('This browser camera does not support the selected flash mode.');
      if (this.capabilities.torch)
        await this.track.applyConstraints({ advanced: [{ torch: false }] });
    }
    this.check();
    this.flashMode = mode;
    this.notify();
  }
  async zoom(value) {
    this.check(true);
    const cap = this.capabilities.zoom;
    if (!cap || !Number.isFinite(value)) throw Error('Zoom is unavailable on this browser camera.');
    await this.track.applyConstraints({
      advanced: [{ zoom: Math.max(cap.min, Math.min(cap.max, value)) }],
    });
    this.check();
    this.notify();
  }
  async focus(x, y, exposure = false) {
    this.check(true);
    if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
      throw Error('Focus points must be inside the preview.');
    const supported = this.environment.navigator.mediaDevices.getSupportedConstraints?.() ?? {};
    if (!supported.pointsOfInterest)
      throw Error('Tap-to-focus is unavailable on this browser camera.');
    const setting = { pointsOfInterest: [{ x, y }] },
      name = exposure ? 'exposureMode' : 'focusMode';
    if (this.capabilities[name]?.includes('single-shot')) setting[name] = 'single-shot';
    await this.track.applyConstraints({ advanced: [setting] });
  }
  async startRecording() {
    this.check(true);
    if (this.recording || this.startingRecording)
      throw Error('A recording is already in progress.');
    this.startingRecording = true;
    let microphone, canvasStream;
    try {
      const Recorder = this.environment.MediaRecorder;
      if (!Recorder) throw Error('Video recording is unavailable in this browser.');
      const mime = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find((type) => Recorder.isTypeSupported(type));
      if (!mime) throw Error('This browser has no supported video recording format.');
      if (this.enableAudio) microphone = await this.acquire({ audio: true, video: false });
      this.check(true);
      const canvas = this.environment.document.createElement('canvas'),
        sourceW = this.video.videoWidth,
        sourceH = this.video.videoHeight;
      let ratio =
        enumName(this.videoAspectRatio, 'VideoAspectRatio') === 'ratio4_3' ? 4 / 3 : 16 / 9;
      if (this.orientation.startsWith('portrait')) ratio = 1 / ratio;
      let width = sourceW,
        height = sourceH;
      if (width / height > ratio) width = height * ratio;
      else height = width / ratio;
      canvas.width = Math.max(2, Math.floor(width / 2) * 2);
      canvas.height = Math.max(2, Math.floor(height / 2) * 2);
      const context = canvas.getContext('2d'),
        draw = () =>
          context.drawImage(
            this.video,
            (sourceW - width) / 2,
            (sourceH - height) / 2,
            width,
            height,
            0,
            0,
            canvas.width,
            canvas.height,
          );
      draw();
      canvasStream = canvas.captureStream(30);
      const Stream = this.environment.MediaStream,
        stream = new Stream([
          ...canvasStream.getVideoTracks(),
          ...(microphone?.getAudioTracks() ?? []),
        ]),
        recorder = new Recorder(stream, {
          mimeType: mime,
          ...(this.videoBitRateBps ? { videoBitsPerSecond: this.videoBitRateBps } : {}),
        });
      const record = {
        recorder,
        stream,
        microphone,
        canvasStream,
        chunks: [],
        bytes: 0,
        mime,
        finished: false,
        error: null,
        resolve: null,
        reject: null,
      };
      this.recording = record;
      const frame = () => {
        if (this.recording !== record || record.finished) return;
        try {
          draw();
          record.frame = this.environment.requestAnimationFrame(frame);
        } catch (error) {
          this.abortRecording(error);
        }
      };
      record.frame = this.environment.requestAnimationFrame(frame);
      record.result = new Promise((resolve, reject) => {
        record.resolve = resolve;
        record.reject = reject;
      });
      record.result.catch(() => {});
      recorder.addEventListener('dataavailable', (event) => {
        if (record.finished || !event.data.size) return;
        record.bytes += event.data.size;
        if (record.bytes > 50 * 1024 * 1024) {
          this.abortRecording(Error('Preview recordings are limited to 50 MB.'));
          return;
        }
        record.chunks.push(event.data);
      });
      recorder.addEventListener('error', (event) =>
        this.abortRecording(event.error ?? Error('Video encoding failed.')),
      );
      recorder.addEventListener('stop', () => {
        if (record.finished) return;
        record.finished = true;
        clearTimeout(record.limit);
        this.environment.cancelAnimationFrame(record.frame);
        stop(canvasStream);
        stop(microphone);
        this.recording = null;
        this.isRecordingVideo = false;
        try {
          this.check();
          if (!record.bytes) throw Error('The recording produced no video data.');
          const blob = new this.environment.Blob(record.chunks, {
              type: recorder.mimeType || mime,
            }),
            path = this.owner.file(
              blob,
              mime.startsWith('video/mp4') ? 'recording.mp4' : 'recording.webm',
            );
          record.resolve(path);
        } catch (error) {
          record.reject(error);
        }
        record.chunks = [];
        this.notify();
      });
      recorder.start(250);
      this.isRecordingVideo = true;
      record.limit = setTimeout(
        () => this.abortRecording(Error('Preview recordings are limited to two minutes.')),
        120000,
      );
      this.recordingEvents.emit({
        kind: symbol('RecordingEventKind', 'start'),
        durationUs: 0,
        sizeBytes: 0,
      });
      this.notify();
    } catch (error) {
      if (this.recording) this.abortRecording(error);
      else {
        stop(microphone);
        stop(canvasStream);
      }
      throw error;
    } finally {
      this.startingRecording = false;
    }
  }
  stopRecording() {
    this.check(true);
    const record = this.recording;
    if (!record || !this.isRecordingVideo) throw Error('No camera recording is in progress.');
    if (record.recorder.state !== 'inactive') record.recorder.stop();
    return record.result;
  }
  abortRecording(error) {
    const record = this.recording;
    if (!record) return;
    record.finished = true;
    this.recording = null;
    this.isRecordingVideo = false;
    clearTimeout(record.limit);
    this.environment.cancelAnimationFrame(record.frame);
    try {
      if (record.recorder.state !== 'inactive') record.recorder.stop();
    } catch {}
    stop(record.stream);
    stop(record.microphone);
    record.chunks = [];
    record.reject(error);
    if (!this.disposed) {
      this.runtime.actionErrors.push(error.message);
      this.notify();
    }
  }
  read(name) {
    if (
      [
        'description',
        'resolutionPreset',
        'enableAudio',
        'videoQuality',
        'videoAspectRatio',
        'videoBitRateBps',
        'isInitialized',
        'isRecordingVideo',
        'previewHandle',
        'flashMode',
        'recordingEvents',
      ].includes(name)
    )
      return this[name];
    throw Error(`CameraController.${name} needs another browser adapter.`);
  }
  invoke(name, args, props = {}) {
    if (name === 'dispose') {
      if (args.length || Object.keys(props).length) throw Error('dispose takes no arguments.');
      this.dispose();
      return null;
    }
    this.check();
    const counts = {
      initialize: 0,
      takePicture: 0,
      setFlashMode: 1,
      startVideoRecording: 0,
      stopVideoRecording: 0,
      pauseVideoRecording: 0,
      resumeVideoRecording: 0,
      setCaptureOrientation: 1,
      setVideoAspectRatio: 1,
      setResolutionPreset: 1,
      warmupVideoSensor: 0,
      setZoomLevel: 1,
      setFocusPoint: 2,
      setExposurePoint: 2,
      saveToGallery: 1,
      openGallery: 0,
      addListener: 1,
      removeListener: 1,
    };
    if (
      counts[name] !== args.length ||
      Object.keys(props).some((k) => name !== 'saveToGallery' || k !== 'isVideo')
    )
      throw Error(`Unsupported CameraController.${name} arguments.`);
    if (name === 'initialize') return this.initialize();
    if (name === 'takePicture') return this.takePicture();
    if (name === 'setFlashMode') return this.report(this.setFlash(args[0]));
    if (name === 'startVideoRecording') return this.startRecording();
    if (name === 'stopVideoRecording') return this.stopRecording();
    if (name === 'setCaptureOrientation') {
      this.orientation = enumName(args[0], 'CaptureOrientation');
      return null;
    }
    if (name === 'setVideoAspectRatio') {
      if (this.isRecordingVideo) throw Error('Cannot change aspect ratio while recording.');
      enumName(args[0], 'VideoAspectRatio');
      this.videoAspectRatio = args[0];
      return Promise.resolve(null);
    }
    if (name === 'setResolutionPreset') {
      this.check(true);
      if (this.isRecordingVideo) throw Error('Cannot change resolution while recording.');
      const height = resolution[enumName(args[0], 'ResolutionPreset')];
      return this.track
        .applyConstraints({
          width: { ideal: Math.round((height * 16) / 9) },
          height: { ideal: height },
        })
        .then(() => {
          this.check();
          this.resolutionPreset = args[0];
          this.notify();
        });
    }
    if (name === 'warmupVideoSensor') {
      if (this.isRecordingVideo) throw Error('Cannot warm up during recording.');
      return Promise.resolve(null);
    }
    if (name === 'pauseVideoRecording' || name === 'resumeVideoRecording') {
      const record = this.recording;
      if (!record) return null;
      const pause = name === 'pauseVideoRecording';
      if (record.recorder.state === (pause ? 'recording' : 'paused')) {
        record.recorder[pause ? 'pause' : 'resume']();
        this.recordingEvents.emit({
          kind: symbol('RecordingEventKind', pause ? 'pause' : 'resume'),
          durationUs: 0,
          sizeBytes: record.bytes,
        });
      }
      return null;
    }
    if (name === 'setZoomLevel') return this.report(this.zoom(args[0]));
    if (name === 'setFocusPoint' || name === 'setExposurePoint')
      return this.report(this.focus(args[0], args[1], name === 'setExposurePoint'));
    if (name === 'saveToGallery') {
      const file = this.runtime.services.files.get(args[0]);
      if (!file) throw Error('Only captures owned by this preview can be saved.');
      this.owner.gallery.add(args[0]);
      return Promise.resolve(false);
    }
    if (name === 'openGallery') {
      this.owner.openGallery();
      return null;
    }
    if (name === 'addListener') {
      if (typeof args[0] !== 'function') throw Error('Camera listener needs a callback.');
      this.listeners.add(args[0]);
      return null;
    }
    if (name === 'removeListener') {
      this.listeners.delete(args[0]);
      return null;
    }
    throw Error(`CameraController.${name} needs another browser adapter.`);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const cancel of this.cancellations) cancel();
    this.cancellations.clear();
    this.abortRecording(Error('Camera recording cancelled.'));
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    stop(this.stream);
    this.stream = null;
    this.video?.pause();
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.isInitialized = false;
    this.previewHandle = null;
    this.recordingEvents.close();
    this.listeners.clear();
    this.observers.clear();
    this.owner.controllers.delete(this);
  }
}

export class PreviewCamera {
  constructor(runtime) {
    this.runtime = runtime;
    this.environment = runtime.browserEnvironment;
    this.controllers = new Set();
    this.views = new Map();
    this.nextHandle = 0;
    this.gallery = new Set();
    this.descriptions = [];
    this.cancellations = new Set();
    this.disposed = false;
  }
  async refreshDescriptions(active) {
    const devices = this.environment.navigator?.mediaDevices;
    if (!devices?.enumerateDevices)
      throw Error('Camera access requires HTTPS and browser media capture support.');
    const found = await devices.enumerateDevices();
    if (this.disposed) throw Error('Camera enumeration cancelled.');
    const descriptions = found
      .filter((device) => device.kind === 'videoinput')
      .map((device) => {
        const old =
          active?.name === device.deviceId
            ? active
            : this.descriptions.find((item) => item.name === device.deviceId);
        let facing = [];
        try {
          facing = device.getCapabilities?.().facingMode ?? [];
        } catch {}
        return (
          old ?? {
            cameraDescription: true,
            name: device.deviceId,
            lensDirection: symbol(
              'CameraLensDirection',
              facing.includes('user')
                ? 'front'
                : facing.includes('environment')
                  ? 'back'
                  : 'external',
            ),
            sensorOrientation: 0,
          }
        );
      });
    // Permission may reveal devices that enumeration hid earlier. Keep the
    // tutorial's list reference and the active camera's observed metadata.
    this.descriptions.splice(0, this.descriptions.length, ...descriptions);
    return this.descriptions;
  }
  async available() {
    return this.refreshDescriptions();
  }
  async microphone() {
    let stream;
    try {
      stream = await requestMedia(
        this.environment,
        { audio: true, video: false },
        this.cancellations,
        () => this.disposed,
      );
      return !this.disposed;
    } catch {
      return false;
    } finally {
      stop(stream);
    }
  }
  invoke(name, args, props) {
    if (this.disposed) throw Error('The camera preview was disposed.');
    if (name === 'CameraDescription') {
      if (
        args.length ||
        Object.keys(props).some(
          (k) => !['name', 'lensDirection', 'sensorOrientation'].includes(k),
        ) ||
        typeof props.name !== 'string' ||
        !Number.isInteger(props.sensorOrientation)
      )
        throw Error('Invalid camera description.');
      enumName(props.lensDirection, 'CameraLensDirection');
      return { cameraDescription: true, ...props };
    }
    if (name === 'CameraController') {
      if (
        args.length !== 2 ||
        Object.keys(props).some(
          (k) =>
            !['enableAudio', 'videoQuality', 'videoAspectRatio', 'videoBitRateBps'].includes(k),
        )
      )
        throw Error('Invalid camera controller arguments.');
      if (this.controllers.size >= 2)
        throw Error('A preview can open at most two camera controllers.');
      const c = new PreviewCameraController(this, ...args, props);
      this.controllers.add(c);
      return c;
    }
    if (args.length || Object.keys(props).length)
      throw Error('Camera permission and enumeration methods take no arguments.');
    if (name === 'DartNativeCamera.availableCameras')
      return this.runtime.routeFuture(this.available());
    if (name === 'DartNativeCamera.requestMicrophonePermission')
      return this.runtime.routeFuture(this.microphone());
    if (name === 'DartNativeCamera.requestGalleryAddPermission')
      return this.runtime.routeFuture(Promise.resolve(false));
    throw Error('Unsupported camera API.');
  }
  file(blob, name) {
    if (this.disposed) throw Error('Camera capture cancelled.');
    return this.runtime.services.remember(
      new this.environment.File([blob], name, { type: blob.type }),
    );
  }
  openGallery() {
    const document = this.environment.document;
    if (!document) throw Error('The preview gallery needs a browser.');
    this.dialog?.close();
    const dialog = document.createElement('dialog');
    this.dialog = dialog;
    Object.assign(dialog.style, {
      maxWidth: '720px',
      maxHeight: '80vh',
      background: '#fff',
      color: '#222',
      padding: '24px',
      border: '1px solid #ccc',
      borderRadius: '12px',
      font: '14px system-ui',
    });
    const title = document.createElement('h2');
    title.textContent = 'Preview captures';
    const note = document.createElement('p');
    note.textContent =
      'These captures stay in this preview session. Download a file to keep it; the browser cannot save directly to Photos.';
    const close = document.createElement('button');
    close.textContent = 'Close gallery';
    close.onclick = () => dialog.close();
    dialog.append(title, note, close);
    for (const path of this.gallery) {
      const file = this.runtime.services.files.get(path);
      if (!file) continue;
      const box = document.createElement('div'),
        media = document.createElement(file.type.startsWith('video/') ? 'video' : 'img');
      media.src = path;
      if (media.tagName === 'VIDEO') media.controls = true;
      else media.alt = 'Captured photo';
      Object.assign(media.style, {
        display: 'block',
        maxWidth: '100%',
        maxHeight: '300px',
        marginTop: '16px',
      });
      const link = document.createElement('a');
      link.href = path;
      link.download = file.name;
      link.textContent = `Download ${file.name}`;
      box.append(media, link);
      dialog.append(box);
    }
    if (!this.gallery.size) {
      const empty = document.createElement('p');
      empty.textContent = 'Take a photo or record a video to see it here.';
      dialog.append(empty);
    }
    dialog.addEventListener(
      'close',
      () => {
        for (const video of dialog.querySelectorAll('video')) video.pause();
        dialog.remove();
        if (this.dialog === dialog) this.dialog = null;
      },
      { once: true },
    );
    document.body.append(dialog);
    dialog.showModal();
  }
  finishFrame(keys) {
    for (const [key, view] of this.views)
      if (!keys.has(key)) {
        view.dispose();
        this.views.delete(key);
      }
  }
  dispose() {
    this.disposed = true;
    for (const cancel of this.cancellations) cancel();
    this.cancellations.clear();
    this.dialog?.close();
    for (const c of [...this.controllers]) c.dispose();
    for (const view of this.views.values()) view.dispose();
    this.views.clear();
    this.gallery.clear();
  }
}
