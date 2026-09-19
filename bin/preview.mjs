#!/usr/bin/env node
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, unlink, open, realpath, readdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createPreviewServer } from '../lib/server.mjs';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simMiddleware } from 'serve-sim/middleware';
import { generateHost } from '../lib/generate.mjs';
import { DiscoveryClient } from '../lib/discovery-client.mjs';
import { fixtureEnvironment } from '../runtime/fixture-settings.js';
import { Machine } from '../lib/machine.mjs';
import { identifyNativeProcess, stopNativeProcess } from '../lib/native-process.mjs';
import { NativeKeyboard } from '../lib/keyboard.mjs';
import {
  parseArgs,
  resolveToolchain,
  checkInstallation,
  checkProject,
  listDevices,
  prepareDevice,
  cliError,
} from '../lib/toolchain.mjs';

async function main() {
  const exec = promisify(execFile);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const options = parseArgs(
    process.argv.slice(2),
    ['--project', '--dn', '--device', '--port', '--parent-pid'],
    ['--help', '--native'],
  );
  if (options.help || !options.project) {
    console.log(
      'Usage: npm start -- --project PATH [--dn /path/to/dn] [--device UDID] [--native] [--port 5196]',
    );
    if (!options.help) process.exitCode = 64;
    return;
  }
  if (options.positionals.length)
    throw new Error('Unexpected argument. Use --project to specify the app folder.');
  const project = await realpath(path.resolve(options.project));
  const { dn, sdk, dart } = await resolveToolchain({ ...options, project });
  await checkInstallation();
  await checkProject(project);
  let device = options.device || null;
  const port = options.port === undefined ? 5196 : Number(options.port);
  const parentPid = options['parent-pid'] === undefined ? null : Number(options['parent-pid']);
  if (parentPid !== null && (!Number.isSafeInteger(parentPid) || parentPid < 2))
    throw new Error('Invalid parent PID');
  if (
    (device && !/^[A-Fa-f0-9-]{36}$/.test(device)) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error('Invalid device or port');

  const lockPath = path.join(project, '.dart_tool/dn-preview.lock');
  const lock = await open(lockPath, 'wx').catch(() => {
    throw new Error(
      `A preview session already owns ${lockPath}. Stop it before starting another session.`,
    );
  });
  await lock.writeFile(String(process.pid));
  await lock.close();
  const discovery = new DiscoveryClient(
    dart,
    path.join(root, 'bin/discover.dart'),
    project,
    sdk,
    root,
  );
  const generated = path.join(project, 'lib/dn_preview_generated.dart');
  const serveCLI = path.join(root, 'node_modules/serve-sim/dist/serve-sim.js');
  const state = {
    protocol: 'dn-widget-previewer/1',
    projectRoot: project,
    project: path.basename(project),
    device,
    mode: 'browser',
    sourceRevision: 0,
    browserRevision: 0,
    environments: {},
    browserReset: { revision: 0, id: null },
    status: 'starting',
    previews: [],
    diagnostics: [],
    logs: [],
    selected: null,
    native: null,
    reloadCount: 0,
    stale: true,
    busy: false,
  };
  let machine,
    nativeProcess,
    stream,
    streamOwnerPid,
    server,
    watcher,
    configWatcher,
    closing = false,
    ownsStream = false,
    timer;
  let queue = Promise.resolve();
  const watchers = new Set();
  const keyboard = new NativeKeyboard(async () => {
    const { stdout } = await exec(process.execPath, [serveCLI, '--list', device], {
      timeout: 10000,
    });
    const record = JSON.parse(stdout);
    if (!record.running || record.pid !== streamOwnerPid)
      throw new Error('Owned simulator stream is unavailable');
    return record.wsUrl;
  });
  // A lost IDE extension host must not leave its controller/native app behind.
  const parentWatch = parentPid
    ? setInterval(() => {
        try {
          process.kill(parentPid, 0);
        } catch (error) {
          if (error.code === 'ESRCH') cleanup().then(() => process.exit(0));
        }
      }, 2000)
    : null;
  let middleware,
    sourceFiles = {},
    sourceJSON = '';
  async function readSources() {
    const files = {};
    let bytes = 0;
    async function scan(directory) {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, item.name);
        if (item.isDirectory()) await scan(file);
        else if (
          item.isFile() &&
          item.name.endsWith('.dart') &&
          !item.name.startsWith('dn_preview_generated') &&
          item.name !== 'dartnative_plugin_registrant.dart'
        ) {
          const text = await readFile(file, 'utf8');
          bytes += Buffer.byteLength(text);
          if (bytes > 10 * 1024 * 1024) throw new Error('Browser preview source exceeds 10 MB');
          files[path.relative(path.join(project, 'lib'), file).split(path.sep).join('/')] = text;
        }
      }
    }
    await scan(path.join(project, 'lib'));
    const next = JSON.stringify(files);
    if (next !== sourceJSON) {
      sourceJSON = next;
      sourceFiles = files;
      state.sourceRevision++;
    }
  }
  const log = (text) => {
    const line = String(text)
      .replace(/dnk_[A-Za-z0-9_-]+/g, '[redacted]')
      .slice(0, 4000);
    state.logs.push({ time: new Date().toISOString(), text: line });
    state.logs = state.logs.slice(-120);
    console.log(line);
  };
  function enqueue(task, affectsBuild = true) {
    const job = queue.then(async () => {
      if (closing) return;
      state.busy = true;
      try {
        return await task();
      } catch (error) {
        if (affectsBuild) {
          state.status = 'error';
          state.stale = true;
          log(error.message);
        }
        throw error;
      } finally {
        state.busy = false;
      }
    });
    queue = job.catch(() => {});
    return job;
  }
  async function discover() {
    const found = await discovery.scan();
    if (closing) return false;
    state.diagnostics = found.diagnostics;
    if (found.diagnostics.length) {
      state.status = 'compile-error';
      state.stale = true;
      return false;
    }
    if (!found.previews.length) throw new Error('No @DNPreview factories found in lib/.');
    await readSources();
    state.previews = found.previews;
    const source = generateHost(found.previews);
    const previous = await readFile(generated, 'utf8').catch(() => '');
    if (previous && !previous.startsWith('// Generated by DartNative Widget Previewer.'))
      throw new Error('Generated entry path is occupied by a user file.');
    if (source !== previous) await writeFile(generated, source);
    if (!found.previews.some((p) => p.id === state.selected)) state.selected = found.previews[0].id;
    return true;
  }
  async function control(action, id) {
    if (!machine?.started || machine.closed) throw new Error('Native host is not ready');
    const result = await machine.request('app.callServiceExtension', {
      appId: machine.appId,
      methodName: 'ext.dnPreview.control',
      params: {
        action,
        ...(id ? { id } : {}),
        ...(action === 'status'
          ? {}
          : { environment: JSON.stringify(state.environments[id || state.selected] || {}) }),
      },
    });
    if (result?.error) throw new Error(result.error.message ?? JSON.stringify(result.error));
    state.native = result;
    if (result?.previewId) state.selected = result.previewId;
    return result;
  }
  async function startNative() {
    if (closing) return;
    state.status = 'starting';
    state.stale = true;
    device = await prepareDevice(device);
    state.device = device;
    await readFile(path.join(project, 'lib/dartnative_plugin_registrant.dart')).catch(() => {
      throw new Error(
        'The native plugin registrant is missing. Run dn pub get in the app folder, then retry.',
      );
    });
    if (!stream) await startStream();
    if (closing) return;
    state.status = 'building';
    state.stale = true;
    const child = spawn(
      dn,
      ['--suppress-analytics', 'run', '--machine', '-d', device, '-t', generated],
      { cwd: project, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    machine = new Machine(child);
    const owned = machine;
    owned.on('log', log);
    owned.on('event', (event) => {
      if (event.event === 'app.log') log(event.params.log);
      else if (event.event === 'app.progress' && event.params.message) log(event.params.message);
      else if (event.event === 'daemon.logMessage') log(event.params.message);
    });
    owned.on('exit', () => {
      if (!closing && machine === owned) {
        state.status = 'stopped';
        state.stale = true;
      }
    });
    try {
      await owned.ready();
      await control('select', state.selected);
      nativeProcess = await identifyNativeProcess(state.native.pid, device);
    } catch (error) {
      await owned.stop();
      throw error;
    }
    state.status = 'ready';
    state.stale = false;
    log(`Native host ready: ${state.selected}`);
  }
  async function refresh() {
    const started = performance.now();
    state.status = 'analyzing';
    state.stale = true;
    if (!(await discover())) return;
    if (!machine || machine.closed) {
      if (state.mode === 'native') return startNative();
      state.status = 'ready';
      state.stale = false;
      return;
    }
    state.status = 'reloading';
    const result = await machine.request('app.restart', {
      appId: machine.appId,
      fullRestart: false,
      reason: 'save',
    });
    if (result?.code !== 0) throw new Error(result?.message || 'Native reload failed');
    const desired = state.selected;
    const status = await control('status');
    if (status.previewId !== desired) await control('select', desired);
    state.reloadCount++;
    state.lastReloadMs = Math.round(performance.now() - started);
    state.status = 'ready';
    state.stale = false;
    log(
      `Hot reload complete (${state.lastReloadMs} ms including analysis; native PID ${state.native?.pid})`,
    );
  }
  async function restart() {
    if (state.mode !== 'native') {
      await refresh();
      return;
    }
    if (!(await discover())) return;
    if (machine) await machine.stop();
    await stopNativeProcess(nativeProcess);
    nativeProcess = null;
    await startNative();
  }
  async function stopStream() {
    const ownedStream = stream;
    stream = null;
    if (ownsStream) {
      const record = await exec(process.execPath, [serveCLI, '--list', device], { timeout: 10000 })
        .then((r) => JSON.parse(r.stdout))
        .catch(() => null);
      if (record?.running && record.pid === streamOwnerPid)
        await exec(process.execPath, [serveCLI, '--kill', device], { timeout: 10000 }).catch(
          () => {},
        );
    }
    if (ownedStream && ownedStream.exitCode === null) ownedStream.kill('SIGTERM');
    ownsStream = false;
    streamOwnerPid = null;
    middleware = null;
  }
  async function stopNative() {
    const old = machine;
    machine = null;
    await old?.stop();
    await stopNativeProcess(nativeProcess);
    nativeProcess = null;
    await stopStream();
    state.native = null;
    state.mode = 'browser';
    state.status = 'ready';
    state.stale = false;
  }
  async function startStream() {
    // Do not replace a stream owned by another session.
    const streams = await exec(process.execPath, [serveCLI, '--list', device], { timeout: 10000 });
    if (JSON.parse(streams.stdout).running)
      throw new Error(
        'This simulator already has a stream. Stop its owner or choose another device.',
      );
    ownsStream = true;
    middleware = simMiddleware({
      basePath: '/sim',
      device,
      proxyHelpers: true,
      initialState: { panes: [], fit: true },
    });
    stream = spawn(process.execPath, [serveCLI, '--no-preview', device], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    stream.stdout.on('data', (data) => log(data.toString().trim()));
    stream.stderr.on('data', (data) => log(data.toString().trim()));
    stream.on('error', (error) => log(`Simulator stream: ${error.message}`));
    const ownedStream = stream;
    stream.on('exit', () => {
      if (!closing && stream === ownedStream) {
        state.stale = true;
        state.status = 'stream-stopped';
        log('Simulator stream stopped. Restart the preview controller.');
      }
    });
    // The middleware can start a helper of its own if a browser connects before
    // the stream has registered. Wait here to avoid duplicate owners at startup.
    let streamReady = false;
    for (let i = 0; i < 100; i++) {
      if (stream.exitCode !== null || stream.signalCode !== null)
        throw new Error('Simulator stream exited during startup');
      const record = await exec(process.execPath, [serveCLI, '--list', device], {
        timeout: 10000,
      }).then((r) => JSON.parse(r.stdout));
      if (record.running && Number.isSafeInteger(record.pid)) {
        // serve-sim's no-preview supervisor starts a child that owns the socket.
        const parent = await exec('ps', ['-p', String(record.pid), '-o', 'ppid='])
          .then((r) => Number(r.stdout.trim()))
          .catch(() => null);
        if (record.pid === stream.pid || parent === stream.pid) {
          streamOwnerPid = record.pid;
          streamReady = true;
          break;
        }
        throw new Error('Another process acquired the simulator stream during startup');
      }
      await delay(100);
    }
    if (!streamReady) throw new Error('Simulator stream did not register. Check the stream logs.');
  }
  async function cleanup() {
    if (closing) return;
    closing = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    clearInterval(parentWatch);
    keyboard.close();
    discovery.close();
    server?.closeAllConnections();
    server?.close();
    await machine?.stop();
    await stopNativeProcess(nativeProcess);
    nativeProcess = null;
    await stopStream();
    await unlink(lockPath).catch(() => {});
  }
  process.once('SIGINT', () => cleanup().then(() => process.exit(0)));
  process.once('SIGTERM', () => cleanup().then(() => process.exit(0)));

  async function handleAction(input) {
    const { action, id } = input;
    if (action === 'native') {
      if (input.device && !/^[A-Fa-f0-9-]{36}$/.test(input.device))
        throw new Error('Invalid simulator UDID');
      if (stream && input.device && input.device !== device)
        throw new Error('Stop the native session before changing simulator');
      if (id && !state.previews.some((p) => p.id === id)) throw new Error('Unknown fixture');
      device = input.device || device;
      state.device = device;
      state.mode = 'native';
      if (id) state.selected = id;
      await enqueue(async () => {
        state.status = 'analyzing';
        if (!machine || machine.closed) {
          if (await discover()) await startNative();
        } else {
          await control('select', state.selected);
          state.status = 'ready';
        }
      });
    } else if (action === 'environment') {
      const fixture = state.previews.find((p) => p.id === id);
      if (!fixture) throw new Error('Unknown fixture');
      const inputEnv = input.environment || {};
      const keys = ['width', 'height', 'brightness', 'textScaleFactor', 'locale', 'textDirection'];
      if (Object.keys(inputEnv).some((key) => !keys.includes(key)))
        throw new Error('Unknown preview setting');
      fixtureEnvironment(fixture, inputEnv);
      state.environments[id] = inputEnv;
      if (machine && !machine.closed && state.mode === 'native' && state.selected === id)
        await enqueue(() => control('reset', id));
    } else if (action === 'browser') {
      state.mode = 'browser';
    } else if (action === 'native-stop') await enqueue(stopNative);
    else if (action === 'reload')
      await enqueue(async () => {
        await refresh();
        state.browserRevision++;
      });
    else if (action === 'restart')
      await enqueue(async () => {
        await restart();
        state.browserRevision++;
      });
    else if (action === 'select') {
      if (!state.previews.some((p) => p.id === id)) throw new Error('Unknown fixture');
      if (machine && !machine.closed && state.mode === 'native')
        await enqueue(() => control('select', id));
      else state.selected = id;
    } else if (action === 'reset') {
      if (machine && !machine.closed && state.mode === 'native')
        await enqueue(() => control('reset'));
      else
        state.browserReset = {
          revision: state.browserReset.revision + 1,
          id: state.selected,
        };
    } else throw new Error('Unknown action');
  }

  async function handleInput(input) {
    if (state.status !== 'ready' || state.busy)
      throw new Error('Wait for the native preview to be ready');
    await enqueue(() => {
      if (input.previewId !== state.selected)
        throw new Error('The selected preview changed. Focus the new native field before typing.');
      return keyboard.send(input);
    }, false);
  }

  try {
    server = createPreviewServer({
      port,
      root,
      project,
      getState: () => state,
      getSourceFiles: () => sourceFiles,
      getMiddleware: () => middleware,
      listDevices,
      onAction: handleAction,
      onInput: handleInput,
    });
    server.listen(port, '127.0.0.1');
    await once(server, 'listening');
    console.log(`DartNative Widget Previewer: http://127.0.0.1:${port}/`);
    watcher = watch(path.join(project, 'lib'), { recursive: true }, (_event, filename) => {
      if (!filename?.endsWith('.dart') || filename.startsWith('dn_preview_generated')) return;
      clearTimeout(timer);
      timer = setTimeout(() => enqueue(refresh).catch(() => {}), 350);
    });
    watchers.add(watcher);
    configWatcher = watch(path.join(project, '.dart_tool/package_config.json'), () => {
      // dn run refreshes package metadata before compiling the new host.
      if (state.status === 'starting' || state.status === 'building') return;
      discovery.close();
      state.stale = true;
      state.status = 'restart-required';
      log('Package configuration changed. Restart the native app.');
    });
    watchers.add(configWatcher);
    if (options.native) state.mode = 'native';
    await enqueue(refresh).catch(() => {});
  } catch (error) {
    console.error(error.message);
    await cleanup();
    process.exitCode = 1;
  }
}
await main().catch(cliError);
