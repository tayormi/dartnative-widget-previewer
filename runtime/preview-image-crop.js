export const imageCropCalls = new Set([
  'DartNativeImageCrop.getImageOptions',
  'DartNativeImageCrop.cropImage',
  'DartNativeImageCrop.sampleImage',
]);
export async function cropService(services, name, args, props) {
  const environment = services.environment,
    url = services.fileURL(props.file);
  if (args.length || !url) throw Error('Image cropping needs a file owned by this preview.');
  const allowed = name.endsWith('getImageOptions')
    ? ['file']
    : name.endsWith('cropImage')
      ? ['file', 'area', 'scale']
      : ['file', 'preferredSize', 'preferredWidth', 'preferredHeight'];
  if (Object.keys(props).some((k) => !allowed.includes(k)))
    throw Error('Unsupported image crop arguments.');
  if (typeof environment.createImageBitmap !== 'function' || !environment.document)
    throw Error('Image cropping needs browser image decoding and canvas support.');
  const bitmap = await environment.createImageBitmap(services.files.get(url));
  try {
    if (services.disposed) throw Error('The preview changed before image decoding finished.');
    if (bitmap.width * bitmap.height > 16_000_000)
      throw Error('Image cropping supports images up to 16 megapixels.');
    if (name.endsWith('getImageOptions')) return { width: bitmap.width, height: bitmap.height };
    let sx = 0,
      sy = 0,
      sw = bitmap.width,
      sh = bitmap.height,
      dw = sw,
      dh = sh;
    if (name.endsWith('cropImage')) {
      const area = props.area,
        scale = props.scale ?? 1;
      if (
        area?.valueType !== 'Rect' ||
        ![area.left, area.top, area.right, area.bottom, scale].every(Number.isFinite) ||
        area.left < 0 ||
        area.top < 0 ||
        area.right > 1 + 1e-9 ||
        area.bottom > 1 + 1e-9 ||
        area.right <= area.left ||
        area.bottom <= area.top ||
        scale <= 0 ||
        scale > 4
      )
        throw Error(
          'Crop area must be inside the image (0–1), with scale greater than zero and at most four.',
        );
      sx = area.left * sw;
      sy = area.top * sh;
      sw = (area.right - area.left) * sw;
      sh = (area.bottom - area.top) * sh;
      dw = sw * scale;
      dh = sh * scale;
    } else {
      const { preferredSize, preferredWidth, preferredHeight } = props;
      if (preferredSize != null && (preferredWidth != null || preferredHeight != null))
        throw Error('Choose preferredSize or both width and height.');
      const w = preferredSize ?? preferredWidth,
        h = preferredSize ?? preferredHeight;
      if (![w, h].every((n) => Number.isInteger(n) && n > 0 && n <= 8192))
        throw Error('Image sample dimensions must be between 1 and 8192.');
      const factor = Math.min(1, w / sw, h / sh);
      dw = sw * factor;
      dh = sh * factor;
    }
    dw = Math.max(1, Math.round(dw));
    dh = Math.max(1, Math.round(dh));
    if (dw * dh > 16_000_000) throw Error('The cropped image exceeds 16 megapixels.');
    const canvas = environment.document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const context = canvas.getContext('2d');
    if (!context) throw Error('The browser could not create the image crop surface.');
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(Error('The browser could not encode the cropped image.')),
        'image/jpeg',
        0.95,
      ),
    );
    if (services.disposed) throw Error('The preview changed before image cropping finished.');
    const File = environment.File ?? globalThis.File;
    return {
      browserFile: true,
      path: services.remember(new File([blob], 'cropped.jpg', { type: 'image/jpeg' })),
    };
  } finally {
    bitmap.close();
  }
}
