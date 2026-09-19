import { durationMilliseconds } from './preview-controllers.js';
import { checkSDKCall } from './preview-contract.js';
import { validateSocialPreviewConfig } from './social-preview-config.js';
export const socialCalls = new Set([
  'GoogleSignIn',
  'GoogleSignInAccount',
  'GoogleSignInAuthentication',
  'AuthorizationCredentialAppleID',
  'GoogleSignInException',
  'SignInWithAppleException',
  'SignInWithAppleAuthorizationException',
  'SignInWithApple.getAppleIDCredential',
  'GoogleSignInFFIBindings.loadSymbols',
  'SignInWithAppleFFIBindings.loadSymbols',
]);
const fields = {
  GoogleSignInAccount: ['email', 'displayName', 'authentication'],
  GoogleSignInAuthentication: ['idToken', 'accessToken'],
  AuthorizationCredentialAppleID: [
    'userIdentifier',
    'authorizationCode',
    'identityToken',
    'givenName',
    'familyName',
    'email',
    'state',
  ],
};
export class SocialValue {
  constructor(type, props) {
    this.valueType = type;
    this.values = {};
    for (const key of fields[type]) this.values[key] = props[key] ?? null;
    Object.freeze(this.values);
    Object.freeze(this);
  }
  read(name) {
    if (Object.hasOwn(this.values, name)) return this.values[name];
    throw Error(`Unsupported ${this.valueType}.${name}.`);
  }
  toString() {
    return `Instance of '${this.valueType}'`;
  }
}
export class SocialException extends Error {
  constructor(type, message, props = {}) {
    super(message);
    this.valueType = type;
    this.canceled = props.canceled ?? false;
    this.code = props.code ?? { symbol: 'AuthorizationErrorCode.unknown' };
    this.dartTypes =
      type === 'SignInWithAppleAuthorizationException' ? ['SignInWithAppleException'] : [];
  }
  read(name) {
    if (['message', 'code', 'canceled'].includes(name)) return this[name];
    throw Error(`Unsupported ${this.valueType}.${name}.`);
  }
}
const failure = (provider, message, canceled = false) =>
  provider === 'google'
    ? new SocialException('GoogleSignInException', message, { canceled })
    : new SocialException('SignInWithAppleAuthorizationException', message, {
        code: { symbol: `AuthorizationErrorCode.${canceled ? 'canceled' : 'failed'}` },
      });
function retryOptions(props) {
  const maxAttempts = props.maxAttempts ?? 2,
    retryDelay = props.retryDelay == null ? 500 : durationMilliseconds(props.retryDelay);
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 5 ||
    !Number.isFinite(retryDelay) ||
    retryDelay < 0 ||
    retryDelay > 10000
  )
    throw Error('Browser sign-in allows 1–5 attempts with a delay of up to 10 seconds.');
  return { maxAttempts, retryDelay };
}
export class PreviewGoogleSignIn {
  constructor(owner, serverClientId) {
    if (serverClientId != null && typeof serverClientId !== 'string')
      throw Error('serverClientId must be text.');
    this.owner = owner;
    this.serverClientId = serverClientId ?? null;
    this.valueType = 'GoogleSignIn';
  }
  read(name) {
    if (name === 'serverClientId') return this.serverClientId;
    throw Error(`GoogleSignIn.${name} has no browser adapter.`);
  }
  invoke(name, args, props) {
    if (
      name !== 'signIn' ||
      args.length ||
      Object.keys(props).some((k) => !['maxAttempts', 'retryDelay'].includes(k))
    )
      throw Error('Unsupported GoogleSignIn call.');
    return this.owner.signIn('google', { ...retryOptions(props), clientId: this.serverClientId });
  }
}
export class PreviewSocial {
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.options = options;
    this.disposed = false;
    this.pending = new Set();
  }
  invoke(name, args, props) {
    if (this.disposed) throw Error('The sign-in preview was disposed.');
    if (name.endsWith('FFIBindings.loadSymbols')) {
      if (args.length || Object.keys(props).length) throw Error('loadSymbols takes no arguments.');
      return null;
    }
    if (name === 'SignInWithApple.getAppleIDCredential') {
      if (
        args.length ||
        Object.keys(props).some(
          (k) => !['scopes', 'nonce', 'state', 'maxAttempts', 'retryDelay'].includes(k),
        ) ||
        !Array.isArray(props.scopes) ||
        props.scopes.some(
          (v) =>
            !['AppleIDAuthorizationScopes.email', 'AppleIDAuthorizationScopes.fullName'].includes(
              v?.symbol,
            ),
        )
      )
        throw Error('Apple sign-in needs valid AppleIDAuthorizationScopes.');
      for (const key of ['nonce', 'state'])
        if (props[key] != null && (typeof props[key] !== 'string' || props[key].length > 1024))
          throw Error(`Apple ${key} must be text of up to 1,024 characters.`);
      return this.signIn('apple', {
        ...retryOptions(props),
        scopes: [...new Set(props.scopes.map((v) => v.symbol.split('.').at(-1)))],
        nonce: props.nonce,
        state: props.state,
      });
    }
    checkSDKCall(name, args, props);
    if (name === 'GoogleSignIn') return new PreviewGoogleSignIn(this, props.serverClientId);
    if (name.endsWith('Exception')) {
      if (
        typeof args[0] !== 'string' ||
        (props.canceled != null && typeof props.canceled !== 'boolean')
      )
        throw Error('Invalid sign-in exception.');
      if (
        name === 'SignInWithAppleAuthorizationException' &&
        !['canceled', 'failed', 'invalidResponse', 'notHandled', 'unknown'].some(
          (n) => props.code?.symbol === `AuthorizationErrorCode.${n}`,
        )
      )
        throw Error('Invalid Apple authorization error code.');
      return new SocialException(name, args[0], props);
    }
    if (name === 'GoogleSignInAccount') {
      if (
        typeof props.email !== 'string' ||
        (props.displayName != null && typeof props.displayName !== 'string') ||
        !(props.authentication instanceof SocialValue) ||
        props.authentication.valueType !== 'GoogleSignInAuthentication'
      )
        throw Error('Invalid Google account.');
    } else
      for (const key of fields[name])
        if (props[key] != null && typeof props[key] !== 'string')
          throw Error(`${name}.${key} must be text.`);
    if (name === 'AuthorizationCredentialAppleID' && typeof props.userIdentifier !== 'string')
      throw Error('Apple userIdentifier must be text.');
    return new SocialValue(name, props);
  }
  signIn(provider, request) {
    const operation = () => {
      if (this.disposed) throw failure(provider, 'The sign-in preview was disposed.', true);
      if (this.pending.size)
        throw failure(
          provider,
          'A sign-in is already open in this preview. Finish or cancel it first.',
        );
      const config = validateSocialPreviewConfig(this.options.config ?? {}),
        clientId =
          provider === 'google' ? request.clientId || config.googleClientId : config.appleClientId;
      if (!clientId)
        throw failure(
          provider,
          `Configure ${provider === 'google' ? 'Google' : 'Apple'} sign-in in Preview services first.`,
        );
      if (provider === 'google' && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId))
        throw failure(provider, 'Use a Google web OAuth client ID.');
      if (typeof this.options.connect !== 'function')
        throw failure(
          provider,
          'This host cannot open browser sign-in. Use the configured browser playground.',
        );
      // Opening must happen synchronously during the tutorial's button action.
      // Do not await module loading before the browser reserves the popup.
      const session = this.options.connect({
        provider,
        redirectURI: config.appleRedirectURI,
        ...request,
        clientId,
      });
      this.pending.add(session);
      return session.result
        .then((result) => {
          if (this.disposed)
            throw failure(provider, 'The preview changed while sign-in was open.', true);
          if (result == null) {
            if (provider === 'google') return null;
            throw failure(provider, 'Canceled by user', true);
          }
          if (provider === 'google')
            return this.invoke('GoogleSignInAccount', [], {
              email: result.email,
              displayName: result.displayName ?? null,
              authentication: this.invoke('GoogleSignInAuthentication', [], {
                idToken: result.idToken,
                accessToken: result.accessToken ?? null,
              }),
            });
          return this.invoke('AuthorizationCredentialAppleID', [], {
            userIdentifier: result.userIdentifier,
            authorizationCode: result.authorizationCode,
            identityToken: result.identityToken,
            givenName: result.givenName,
            familyName: result.familyName,
            email: result.email,
            state: request.state ?? null,
          });
        })
        .catch((error) => {
          if (error instanceof SocialException) throw error;
          if (provider === 'google' && error?.canceled === true) return null;
          throw failure(
            provider,
            error?.publicMessage ??
              'Browser sign-in failed. Check the provider settings and try again.',
            error?.canceled === true,
          );
        })
        .finally(() => {
          session.dispose();
          this.pending.delete(session);
        });
    };
    let promise;
    try {
      promise = Promise.resolve(operation());
    } catch (error) {
      promise = Promise.reject(
        error instanceof SocialException ? error : failure(provider, error.message),
      );
    }
    promise.catch(() => {});
    return this.runtime.routeFuture(promise);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const session of this.pending) session.dispose();
    this.pending.clear();
  }
}
