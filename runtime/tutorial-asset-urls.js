// The official sticker CDN does not send CORS headers. These exact public
// assets have a same-origin server route; arbitrary URLs never use it.
const origin = 'https://cdn.presence.is/stickers/cl69ghdwt000100bx966hxbp6/';
export function tutorialLottieRoute(source) {
  if (typeof source !== 'string' || !source.startsWith(origin)) return null;
  const file = source.slice(origin.length);
  return /^(?:[0-9]|1[0-9]|2[0-5])\.zip$/.test(file) ? `/api/tutorial-assets/lottie/${file}` : null;
}
export function tutorialLottieSource(path) {
  const match = /^\/api\/tutorial-assets\/lottie\/([0-9]|1[0-9]|2[0-5])\.zip$/.exec(path);
  return match ? `${origin}${match[1]}.zip` : null;
}
export const tutorialVideoSource = 'https://cdn.dartpub.dev/assets/video/sintel_trailer.mp4';
export function tutorialVideoRoute(source) {
  return source === tutorialVideoSource ? '/api/tutorial-assets/video/sintel_trailer.mp4' : null;
}
export const tutorialAvatarSource = 'https://i.pravatar.cc/300';
export const tutorialAvatarRoute = '/api/tutorial-assets/notifications/avatar.jpg';
