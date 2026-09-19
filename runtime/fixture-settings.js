export function fixtureEnvironment(fixture, overrides = {}) {
  const env = {
    width: fixture.width,
    height: fixture.height,
    brightness: fixture.brightness || 'light',
    textScaleFactor: fixture.textScaleFactor ?? 1,
    locale: null,
    textDirection: null,
    ...overrides,
  };
  if (![env.width, env.height].every((n) => Number.isFinite(n) && n > 0 && n <= 4096))
    throw Error('Dimensions must be between 0 and 4096 points.');
  if (!Number.isFinite(env.textScaleFactor) || env.textScaleFactor < 0.5 || env.textScaleFactor > 3)
    throw Error('Text scale must be between 0.5 and 3.');
  if (!['light', 'dark'].includes(env.brightness)) throw Error('Unknown brightness.');
  if (env.textDirection !== null && !['ltr', 'rtl'].includes(env.textDirection))
    throw Error('Unknown text direction.');
  if (
    env.locale !== null &&
    (typeof env.locale !== 'string' || !/^[a-zA-Z]{2,8}(?:[-_][a-zA-Z0-9]{2,8})*$/.test(env.locale))
  )
    throw Error('Use a locale such as en, fr or ar.');
  return env;
}
