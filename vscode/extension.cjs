const vscode = require('vscode');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { localURL, request, readSession, sourceFile } = require('./session.cjs');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let active, opening, output, diagnostics, lensChanged, resolvedSidebar;

function trust() {
  if (!vscode.workspace.isTrusted)
    throw new Error('Trust this workspace before compiling or running native previews.');
}
async function projectFolder(uri) {
  const folders = vscode.workspace.workspaceFolders?.filter((f) => f.uri.scheme === 'file') || [];
  const current = vscode.workspace.getWorkspaceFolder(
    uri || vscode.window.activeTextEditor?.document.uri || vscode.Uri.file('/'),
  );
  const chosen =
    current ||
    (folders.length === 1
      ? folders[0]
      : (
          await vscode.window.showQuickPick(
            folders.map((f) => ({ label: f.name, folder: f })),
            { placeHolder: 'Choose a DartNative application' },
          )
        )?.folder);
  if (!chosen) throw new Error('Open a local DartNative application folder first.');
  return chosen;
}
async function stop() {
  // Wait for an in-flight launch before disposing ownership.
  if (opening) await opening.catch(() => {});
  const session = active;
  await disconnect(session);
}
async function disconnect(session) {
  if (active === session) active = undefined;
  if (!session) return;
  clearTimeout(session.timer);
  for (const subscription of session.viewSubscriptions) subscription.dispose();
  for (const view of session.views) {
    if (view === session.panel) view.dispose();
    else
      view.webview.html =
        '<p>Run DartNative: Open Widget Preview Sidebar to start previewing again.</p>';
  }
  session.views.clear();
  diagnostics?.clear();
  lensChanged?.fire();
  if (session.child && session.child.exitCode === null && session.child.signalCode === null) {
    session.child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => session.child.once('exit', resolve)),
      delay(12000),
    ]);
  }
}
async function connect(uri) {
  trust();
  const folder = await projectFolder(uri);
  const project = await fs.realpath(folder.uri.fsPath);
  if (active?.project === project) return active;
  if (active) await disconnect(active);
  await fs.access(path.join(project, 'pubspec.yaml'));
  const config = vscode.workspace.getConfiguration('dartnativePreview', folder.uri);
  const base = localURL(config.get('port'));
  const session = {
    project,
    folder,
    base,
    state: null,
    child: null,
    timer: null,
    panel: null,
    sidebar: null,
    views: new Set(),
    viewSubscriptions: [],
  };
  try {
    session.state = await readSession(base, project);
  } catch (error) {
    if (error.cause?.code !== 'ECONNREFUSED') throw error;
    if (process.platform !== 'darwin')
      throw new Error('Starting an iOS preview requires a local Mac with Xcode.');
    const tool = config.get('toolPath'),
      dn = config.get('dnPath');
    if (!path.isAbsolute(tool || ''))
      throw new Error(
        'Set dartnativePreview.toolPath to the installed companion folder, then run npm run setup there. The companion will discover its saved SDK automatically.',
      );
    if (dn && !path.isAbsolute(dn))
      throw new Error('dartnativePreview.dnPath must be an absolute path when set.');
    await fs.access(path.join(tool, 'bin/preview.mjs')).catch(() => {
      throw new Error(
        'The companion was not found at toolPath. Choose the folder containing bin/preview.mjs.',
      );
    });
    if (dn) await fs.access(dn);
    const device = config.get('deviceId');
    session.child = spawn(
      config.get('nodePath'),
      [
        path.join(tool, 'bin/preview.mjs'),
        '--project',
        project,
        ...(dn ? ['--dn', dn] : []),
        ...(device ? ['--device', device] : []),
        '--port',
        String(config.get('port')),
        '--parent-pid',
        String(process.pid),
      ],
      { cwd: tool, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let launchError,
      launchOutput = '';
    session.child.on('error', (error) => {
      launchError = error;
    });
    const log = (chunk) => {
      const text = String(chunk).replace(/dnk_[A-Za-z0-9_-]+/g, '[redacted]');
      launchOutput = (launchOutput + text).slice(-3000);
      output.append(text);
    };
    session.child.stdout.on('data', log);
    session.child.stderr.on('data', log);
    try {
      for (let i = 0; i < 80; i++) {
        if (launchError) throw launchError;
        if (session.child.exitCode !== null || session.child.signalCode !== null)
          throw new Error(
            `Preview controller exited. ${launchOutput.trim() || 'Check Node.js and run npm run doctor in the companion folder.'}`,
          );
        try {
          session.state = await readSession(base, project);
          break;
        } catch (error) {
          if (error.cause?.code !== 'ECONNREFUSED') throw error;
        }
        await delay(250);
      }
      if (!session.state)
        throw new Error(
          'The preview controller did not start. See the DartNative Preview output channel.',
        );
    } catch (error) {
      session.child.kill('SIGTERM');
      throw error;
    }
  }
  active = session;
  if (resolvedSidebar) {
    session.sidebar = resolvedSidebar;
    bindView(session, resolvedSidebar);
  }
  await poll(session);
  return session;
}
async function getSession(uri) {
  if (!opening)
    opening = connect(uri).finally(() => {
      opening = undefined;
    });
  return opening;
}
async function poll(session) {
  if (active !== session) return;
  try {
    session.state = await readSession(session.base, session.project);
    if (active !== session) return;
    const entries = new Map();
    for (const item of session.state.diagnostics) {
      try {
        const file = await sourceFile(session.project, item.file);
        const line = Math.max(0, Number(item.line || 1) - 1);
        if (!Number.isSafeInteger(line)) continue;
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(line, 0, line, 1),
          item.message,
          vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = 'DartNative Preview';
        if (!entries.has(file)) entries.set(file, []);
        entries.get(file).push(diagnostic);
      } catch {
        /* Ignore invalid/outside-project diagnostic paths. */
      }
    }
    if (active !== session) return;
    diagnostics.clear();
    for (const [file, values] of entries) diagnostics.set(vscode.Uri.file(file), values);
    const key = JSON.stringify(session.state.previews);
    if (key !== session.catalogKey) {
      session.catalogKey = key;
      lensChanged.fire();
      followFile(vscode.window.activeTextEditor);
    }
  } catch (error) {
    output.appendLine(error.message);
  }
  if (active === session) session.timer = setTimeout(() => poll(session), 1100);
}
function followFile(editor) {
  if (
    !active?.views.size ||
    !vscode.workspace
      .getConfiguration('dartnativePreview', active.folder.uri)
      .get('followActiveFile')
  )
    return;
  const file = editor
    ? path.relative(active.project, editor.document.uri.fsPath).split(path.sep).join('/')
    : '';
  const filter = active.state.previews.some((p) => p.file === file) ? file : '';
  const theme = [vscode.ColorThemeKind.Dark, vscode.ColorThemeKind.HighContrast].includes(
    vscode.window.activeColorTheme.kind,
  )
    ? 'dark'
    : 'light';
  for (const view of active.views)
    view.webview.postMessage({ type: 'dnPreview.filter', file: filter, theme });
}
function panelHTML(base, bridge) {
  const src = `${base}/?bridge=${bridge}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${base}; script-src 'nonce-${bridge}'; style-src 'nonce-${bridge}';"><style nonce="${bridge}">html,body,iframe{width:100%;height:100%;margin:0;padding:0;border:0;overflow:hidden}</style></head><body><iframe id="preview" title="DartNative widget previews" src="${src}"></iframe><script nonce="${bridge}">const vscode=acquireVsCodeApi();const frame=document.getElementById('preview');let filter;window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.origin===${JSON.stringify(base)}&&event.data?.bridge===${JSON.stringify(bridge)}&&['dnPreview.openSource','dnPreview.runNative'].includes(event.data.type)){vscode.postMessage({type:event.data.type,id:event.data.id,file:event.data.file,line:event.data.line});}else if(event.source!==frame.contentWindow&&event.data?.type==='dnPreview.filter'){filter=event.data;frame.contentWindow.postMessage({...filter,bridge:${JSON.stringify(bridge)}},${JSON.stringify(base)});}});frame.addEventListener('load',()=>{vscode.postMessage({type:'dnPreview.ready'});if(filter)frame.contentWindow.postMessage({...filter,bridge:${JSON.stringify(bridge)}},${JSON.stringify(base)});});</script></body></html>`;
}
function bindView(session, view) {
  if (session.views.has(view)) return;
  session.views.add(view);
  view.webview.options = { enableScripts: true, localResourceRoots: [] };
  view.webview.html = panelHTML(session.base, randomBytes(18).toString('hex'));
  session.viewSubscriptions.push(
    view.onDidDispose(() => {
      session.views.delete(view);
      if (session.panel === view) session.panel = null;
      if (session.sidebar === view) session.sidebar = null;
    }),
  );
  session.viewSubscriptions.push(
    view.webview.onDidReceiveMessage(async (message) => {
      if (active === session && message?.type === 'dnPreview.ready') {
        followFile(vscode.window.activeTextEditor);
        return;
      }
      if (active !== session) return;
      if (message?.type === 'dnPreview.runNative') {
        try {
          await runNative(message.id);
        } catch (error) {
          vscode.window.showErrorMessage(error.message);
        }
        return;
      }
      if (message?.type !== 'dnPreview.openSource') return;
      const fixture = session.state.previews.find((p) => p.id === message.id);
      if (!fixture) return;
      try {
        const file = await sourceFile(
          session.project,
          typeof message.file === 'string' && message.file.startsWith('lib/')
            ? message.file
            : fixture.file,
        );
        const doc = await vscode.workspace.openTextDocument(file);
        const line = Math.min(
          doc.lineCount - 1,
          Math.max(0, (Number.isInteger(message.line) ? message.line : fixture.line) - 1),
        );
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.One,
          selection: new vscode.Range(line, 0, line, 0),
        });
      } catch (error) {
        vscode.window.showErrorMessage(error.message);
      }
    }),
  );
}
async function runNative(id) {
  trust();
  const session = await getSession();
  if (process.platform !== 'darwin')
    throw new Error('Native iOS verification requires a Mac with Xcode.');
  let device =
    vscode.workspace.getConfiguration('dartnativePreview', session.folder.uri).get('deviceId') ||
    session.state.device;
  if (!device) {
    const devices = await request(session.base, '/api/devices');
    if (!devices.length)
      throw new Error('No iOS simulators are installed. Add one in Xcode first.');
    const choices = devices.map((d) => ({
      label: d.name,
      description: `${d.runtime} · ${d.state}`,
      id: d.id,
    }));
    device = (
      await vscode.window.showQuickPick(choices, {
        placeHolder: 'Choose an iOS simulator for native verification',
      })
    )?.id;
    if (!device) return;
  }
  await request(session.base, '/api/action', { action: 'native', id, device });
}
async function open(uri, id) {
  const session = await getSession(uri);
  if (!session.panel) {
    const panel = vscode.window.createWebviewPanel(
      'dartnativePreview',
      'DartNative Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    session.panel = panel;
    bindView(session, panel);
  } else session.panel.reveal(vscode.ViewColumn.Beside, true);
  followFile(vscode.window.activeTextEditor);
  // Editor-title actions supply a second context object; only source actions
  // pass a fixture ID.
  if (typeof id === 'string') await request(session.base, '/api/action', { action: 'select', id });
}
async function select(id) {
  const session = await getSession();
  if (!id)
    id = (
      await vscode.window.showQuickPick(
        session.state.previews.map((p) => ({
          label: p.name,
          description: `${p.group} · ${p.file}:${p.line}`,
          id: p.id,
        })),
        { placeHolder: 'Select a widget preview' },
      )
    )?.id;
  if (id) {
    if (session.sidebar) {
      session.sidebar.show(true);
      await request(session.base, '/api/action', { action: 'select', id });
    } else await open(session.folder.uri, id);
  }
}
function activate(context) {
  output = vscode.window.createOutputChannel('DartNative Preview');
  diagnostics = vscode.languages.createDiagnosticCollection('dartnativePreview');
  lensChanged = new vscode.EventEmitter();
  context.subscriptions.push(output, diagnostics, lensChanged);
  const register = (name, callback) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(`dartnativePreview.${name}`, async (...args) => {
        try {
          trust();
          return await callback(...args);
        } catch (error) {
          output.appendLine(error.stack || error.message);
          vscode.window.showErrorMessage(error.message);
          throw error;
        }
      }),
    );
  register('open', open);
  register('native', runNative);
  register('sidebar', async () => {
    await getSession();
    await vscode.commands.executeCommand('dartnativePreview.sidebar.focus');
  });
  register('select', select);
  register('stop', stop);
  for (const action of ['reload', 'reset', 'restart'])
    register(action, async () => request((await getSession()).base, '/api/action', { action }));
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(followFile),
    vscode.window.onDidChangeActiveColorTheme(() => followFile(vscode.window.activeTextEditor)),
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'dartnativePreview.sidebar',
      {
        async resolveWebviewView(view) {
          resolvedSidebar = view;
          context.subscriptions.push(
            view.onDidDispose(() => {
              if (resolvedSidebar === view) resolvedSidebar = undefined;
            }),
          );
          try {
            const session = await getSession();
            session.sidebar = view;
            bindView(session, view);
            followFile(vscode.window.activeTextEditor);
          } catch (error) {
            view.webview.html =
              '<p>Open a trusted DartNative project and configure the companion tool in Settings. Then run DartNative: Open Widget Previewer.</p>';
            output.appendLine(error.message);
          }
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', pattern: '**/*.dart' },
      {
        onDidChangeCodeLenses: lensChanged.event,
        provideCodeLenses(document) {
          if (!active) return [];
          return active.state.previews
            .filter((p) => path.resolve(active.project, p.file) === document.uri.fsPath)
            .map(
              (p) =>
                new vscode.CodeLens(new vscode.Range(p.line - 1, 0, p.line - 1, 0), {
                  title: `Preview ${p.name}`,
                  command: 'dartnativePreview.select',
                  arguments: [p.id],
                }),
            );
        },
      },
    ),
  );
  // Read-only integration-test surface. Commands are the production entry points.
  return {
    snapshot: () =>
      active
        ? {
            project: active.project,
            owned: !!active.child,
            state: active.state,
            panelOpen: !!active.panel,
            sidebarOpen: !!active.sidebar,
          }
        : null,
  };
}
module.exports = { activate, deactivate: stop };
