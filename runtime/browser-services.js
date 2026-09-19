// Native plugin calls have explicit browser implementations. No file-system
// paths, FFI or arbitrary JavaScript are exposed to interpreted Dart.
import { imageCropCalls, cropService } from './preview-image-crop.js';
export const browserServiceCalls = new Set([
  'File',
  'showMediaPicker',
  'DartNativeCompressor.getVideoThumbnail',
  ...imageCropCalls,
  ...[
    'share',
    'shareWithResult',
    'shareFile',
    'shareFileWithResult',
    'shareFiles',
    'shareFilesWithResult',
  ].map((name) => `Share.${name}`),
]);
const shareResult = (status) => ({ status: { symbol: `ShareResultStatus.${status}` }, raw: '' });

export class BrowserServices {
  constructor(runtime, environment = globalThis) {
    this.runtime = runtime;
    this.environment = environment;
    this.files = new Map();
    this.pending = new Set();
    this.disposed = false;
  }
  invoke(name, args, props) {
    if (this.disposed) throw Error('Browser services were disposed.');
    if (imageCropCalls.has(name)) return cropService(this, name, args, props);
    if (name === 'File') {
      if (args.length !== 1 || typeof args[0] !== 'string' || Object.keys(props).length)
        throw Error('File needs a path.');
      const path = args[0];
      return {
        browserFile: true,
        path,
        parent: { path: path.slice(0, path.lastIndexOf('/')) || '.' },
        existsSync: () => !this.disposed && this.files.has(path),
      };
    }
    if (name === 'showMediaPicker') return this.pickMedia(props);
    if (name === 'DartNativeCompressor.getVideoThumbnail') return this.thumbnail(args[0]);
    const withResult = name.endsWith('WithResult');
    let data;
    if (name === 'Share.share' || name === 'Share.shareWithResult')
      data = { text: String(args[0]) };
    else {
      const paths = name.startsWith('Share.shareFiles') ? args[0] : [args[0]];
      if (!Array.isArray(paths) || !paths.length) throw Error('Choose at least one file to share.');
      if (props.mimeTypes && props.mimeTypes.length !== paths.length)
        throw Error('mimeTypes must match the number of shared paths.');
      data = {
        files: paths.map((path) => {
          const file = this.files.get(path);
          if (!file) throw Error('Only files selected in this preview can be shared.');
          return file;
        }),
      };
      if (props.text != null) data.text = String(props.text);
    }
    return this.share(data, withResult);
  }
  share(data, withResult) {
    const navigator = this.environment.navigator;
    const available =
      typeof navigator?.share === 'function' && (!navigator.canShare || navigator.canShare(data));
    if (!available) {
      if (withResult) return Promise.resolve(shareResult('unavailable'));
      throw Error(
        'System sharing is unavailable in this browser. Try the preview in a browser with Web Share support.',
      );
    }
    // Start immediately inside the input event so browser user activation is
    // retained. The chosen share target is intentionally unavailable on web.
    const promise = Promise.resolve(navigator.share(data));
    if (withResult)
      return promise.then(
        () => shareResult('success'),
        (error) => {
          if (error.name === 'AbortError') return shareResult('dismissed');
          if (['NotAllowedError', 'NotSupportedError', 'InvalidStateError'].includes(error.name))
            return shareResult('unavailable');
          throw error;
        },
      );
    const epoch = this.runtime.epoch;
    promise.catch((error) => {
      if (error.name !== 'AbortError' && !this.disposed && this.runtime.epoch === epoch) {
        this.runtime.actionErrors.push(`Share failed: ${error.message}`);
        this.runtime.onChange();
      }
    });
    return null;
  }
  remember(file) {
    if (this.disposed) throw Error('The preview changed before the selected file was ready.');
    if (!file.name) {
      const File = this.environment.File || globalThis.File;
      file = new File([file], 'thumbnail.jpg', { type: file.type });
    }
    if (file.size > 50 * 1024 * 1024)
      throw Error('Preview media files must be smaller than 50 MB.');
    const total = [...this.files.values()].reduce((size, item) => size + item.size, 0);
    if (total + file.size > 200 * 1024 * 1024)
      throw Error('Preview media limit reached. Reset the preview before picking more files.');
    const path = this.environment.URL.createObjectURL(file);
    this.files.set(path, file);
    return path;
  }
  fileURL(file) {
    return file?.browserFile && this.files.has(file.path) ? file.path : null;
  }
  async pickMedia({ type = { symbol: 'MediaPickerType.images' }, maxSelection = 1 } = {}) {
    if (!Number.isInteger(maxSelection) || maxSelection < 0 || maxSelection > 100)
      throw Error('maxSelection must be between 0 and 100.');
    const kind = type.symbol?.split('.').at(-1),
      accept =
        kind === 'videos' ? 'video/*' : kind === 'imagesAndVideos' ? 'image/*,video/*' : 'image/*';
    if (!['images', 'videos', 'imagesAndVideos'].includes(kind))
      throw Error('Unknown media picker type.');
    const files = await this.chooseMedia({ accept, multiple: maxSelection !== 1 });
    if (maxSelection && files.length > maxSelection)
      throw Error(`Choose at most ${maxSelection} media files.`);
    for (const file of files) {
      if (
        !/^(image|video)\//.test(file.type) ||
        (kind === 'images' && !file.type.startsWith('image/')) ||
        (kind === 'videos' && !file.type.startsWith('video/'))
      )
        throw Error('The selected file is not an allowed image or video.');
      if (file.size > 50 * 1024 * 1024)
        throw Error('Preview media files must be smaller than 50 MB.');
    }
    if (
      [...this.files.values(), ...files].reduce((size, file) => size + file.size, 0) >
      200 * 1024 * 1024
    )
      throw Error('Preview media limit reached. Reset the preview before picking more files.');
    return files.map((file) => ({
      path: this.remember(file),
      name: file.name,
      type: file.type.startsWith('video/') ? 'video' : 'image',
    }));
  }
  chooseMedia(options) {
    if (this.environment.chooseMedia) return this.environment.chooseMedia(options);
    const document = this.environment.document;
    if (!document) throw Error('Media picking needs a browser.');
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = options.accept;
      input.multiple = options.multiple;
      input.hidden = true;
      const finish = (files, error) => {
        input.remove();
        this.pending.delete(cancel);
        error ? reject(error) : resolve(files);
      };
      const cancel = () =>
        finish([], Error('Media picking was cancelled after the preview changed.'));
      this.pending.add(cancel);
      input.addEventListener('change', () => finish([...input.files]), { once: true });
      input.addEventListener('cancel', () => finish([]), { once: true });
      document.body.append(input);
      try {
        input.click();
      } catch (error) {
        finish([], error);
      }
    });
  }
  thumbnail(file) {
    const url = this.fileURL(file);
    if (!url) throw Error('Choose a video in this preview before extracting its thumbnail.');
    if (this.environment.videoThumbnail)
      return this.environment
        .videoThumbnail(this.files.get(url))
        .then((blob) => (blob ? { browserFile: true, path: this.remember(blob) } : null));
    const document = this.environment.document;
    if (!document) throw Error('Video thumbnails need a browser.');
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'auto';
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        this.pending.delete(cancel);
        video.removeAttribute('src');
        video.load();
        resolve(value);
      };
      const cancel = () => finish(null);
      this.pending.add(cancel);
      const timeout = setTimeout(cancel, 15000);
      video.addEventListener('error', cancel, { once: true });
      video.addEventListener(
        'loadeddata',
        () => {
          if (finished) return;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            canvas.toBlob(
              (blob) => {
                if (finished) return;
                if (!blob) {
                  finish(null);
                  return;
                }
                try {
                  finish({ browserFile: true, path: this.remember(blob) });
                } catch {
                  finish(null);
                }
              },
              'image/jpeg',
              0.85,
            );
          } catch {
            finish(null);
          }
        },
        { once: true },
      );
      video.src = url;
      video.load();
    });
  }
  dispose() {
    this.disposed = true;
    for (const cancel of this.pending) cancel();
    this.pending.clear();
    for (const path of this.files.keys()) this.environment.URL.revokeObjectURL(path);
    this.files.clear();
  }
}
