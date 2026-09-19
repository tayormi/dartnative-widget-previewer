export const socialPreviewConfigKey = 'native-lab-social-preview-v1';
export function validateSocialPreviewConfig(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !['googleClientId', 'appleClientId', 'appleRedirectURI'].includes(k),
    )
  )
    throw Error(
      'Use public Google and Apple client IDs only. Client secrets and private keys stay on your server.',
    );
  const result = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v !== 'string' || v.length > 2048) throw Error('Invalid sign-in configuration.');
    if (v.trim()) result[key] = v.trim();
  }
  if (
    result.googleClientId &&
    !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(result.googleClientId)
  )
    throw Error('Enter a Google web OAuth client ID.');
  if (result.appleClientId && !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(result.appleClientId))
    throw Error('Enter an Apple Services ID.');
  if (!!result.appleClientId !== !!result.appleRedirectURI)
    throw Error('Apple sign-in needs both a Services ID and a registered HTTPS redirect URL.');
  if (result.appleRedirectURI) {
    let url;
    try {
      url = new URL(result.appleRedirectURI);
    } catch {
      throw Error('Enter the registered Apple HTTPS redirect URL.');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      !url.hostname.includes('.') ||
      /^[\d.]+$/.test(url.hostname) ||
      url.hostname.endsWith('.localhost') ||
      url.hostname.includes(':')
    )
      throw Error(
        'Apple requires an HTTPS redirect URL with a domain name, without an IP address or fragment.',
      );
  }
  return result;
}
export function readSocialPreviewConfig(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(socialPreviewConfigKey);
    return value ? validateSocialPreviewConfig(JSON.parse(value)) : {};
  } catch {
    return {};
  }
}
export function saveSocialPreviewConfig(value, storage = globalThis.localStorage) {
  if (value == null) storage.removeItem(socialPreviewConfigKey);
  else storage.setItem(socialPreviewConfigKey, JSON.stringify(validateSocialPreviewConfig(value)));
}
