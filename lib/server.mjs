import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const projectTypes = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
};
const staticTypes = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
  '.md': 'text/plain',
};
const pages = {
  '/': ['index.html', 'text/html'],
  '/app.js': ['app.js', 'text/javascript'],
  '/api.js': ['api.js', 'text/javascript'],
  '/preview-card.js': ['preview-card.js', 'text/javascript'],
  '/style.css': ['style.css', 'text/css'],
  '/dartnative-logo.png': ['dartnative-logo.png', 'image/png'],
};

class RequestError extends Error {
  constructor(status) {
    super();
    this.status = status;
  }
}

function sendJson(response, value, status = 200) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  if (request.headers['content-type'] !== 'application/json') throw new RequestError(415);
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8192) throw new RequestError(413);
  }
  return JSON.parse(body);
}

async function serveAsset(response, base, requested, types, boundaryError, typeError) {
  const directory = await realpath(base);
  const file = await realpath(path.resolve(directory, requested));
  const relative = path.relative(directory, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(boundaryError);
  const mime = types[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(typeError);
  response.setHeader('Content-Type', mime);
  response.end(await readFile(file));
}

export function createPreviewServer({
  port,
  root,
  project,
  getState,
  getSourceFiles,
  getMiddleware,
  listDevices,
  onAction,
  onInput,
}) {
  const host = `127.0.0.1:${port}`;
  const origin = `http://${host}`;
  const webRoot = path.join(root, 'web');
  const server = createServer(async (request, response) => {
    if (
      request.headers.host !== host ||
      (request.headers.origin && request.headers.origin !== origin)
    ) {
      response.writeHead(403);
      response.end('Local preview origin required');
      return;
    }
    const url = new URL(request.url, origin);
    response.setHeader('Cache-Control', 'no-store');
    try {
      const middleware = getMiddleware();
      if (url.pathname.startsWith('/sim') && middleware) {
        middleware(request, response, () => {
          response.writeHead(404);
          response.end();
        });
        return;
      }
      if (request.method === 'POST' && ['/api/action', '/api/input'].includes(url.pathname)) {
        const input = await readJson(request);
        await (url.pathname === '/api/action' ? onAction(input) : onInput(input));
        return sendJson(response, { ok: true });
      }
      if (request.method !== 'GET') throw new RequestError(404);
      switch (url.pathname) {
        case '/api/devices':
          return sendJson(response, await listDevices());
        case '/api/state':
          return sendJson(response, getState());
        case '/api/project':
          return sendJson(response, {
            revision: getState().sourceRevision,
            files: getSourceFiles(),
          });
        case '/api/asset':
          return await serveAsset(
            response,
            project,
            url.searchParams.get('path') || '',
            projectTypes,
            'Asset must be inside the project',
            'Unsupported preview asset type',
          );
      }
      if (/^\/(vendor|parser|fonts|onnx|licenses)\//.test(url.pathname)) {
        return await serveAsset(
          response,
          webRoot,
          '.' + decodeURIComponent(url.pathname),
          staticTypes,
          'Invalid static asset',
          'Unsupported static asset',
        );
      }
      const asset = pages[url.pathname];
      if (!asset) throw new RequestError(404);
      response.setHeader('Content-Type', asset[1]);
      response.end(await readFile(path.join(webRoot, asset[0])));
    } catch (error) {
      if (error instanceof RequestError) {
        response.writeHead(error.status);
        response.end();
      } else {
        sendJson(response, { error: error.message }, 400);
      }
    }
  });
  server.on('upgrade', (request, socket, head) => {
    if (request.headers.host !== host || request.headers.origin !== origin) return socket.destroy();
    const middleware = getMiddleware();
    if (middleware) middleware.handleUpgrade(request, socket, head);
    else socket.destroy();
  });
  return server;
}
