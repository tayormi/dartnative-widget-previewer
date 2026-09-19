const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, timeout = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    await delay(500);
  }
  throw new Error('Timed out waiting for native IDE state');
}
exports.run = async () => {
  const extension = vscode.extensions.getExtension('native-lab.dartnative-widget-previewer');
  assert.ok(extension);
  const api = await extension.activate();
  const project = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const file = path.join(project, 'lib/previews.dart');
  const document = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(document);
  const original = await fs.readFile(file, 'utf8');
  const owned = process.env.DN_TEST_OWNED === '1';
  const results = { mode: owned ? 'owned' : 'attached', checks: [] };
  if (process.env.DN_TEST_OFFICIAL === '1') {
    const official = vscode.extensions.getExtension('Beatcode-studio.dartnative');
    assert.ok(official, 'Official DartNative extension must be installed');
    await official.activate();
    results.officialExtension = official.packageJSON.version;
    results.checks.push(
      'Official DartNative extension activates alongside the installed previewer',
    );
  }
  try {
    await vscode.commands.executeCommand('dartnativePreview.open', document.uri, { viewColumn: 1 });
    const ready = await until(() => api.snapshot()?.state.status === 'ready' && api.snapshot());
    assert.equal(ready.owned, owned);
    assert.equal(ready.panelOpen, true);
    assert.equal(ready.state.mode, 'browser');
    assert.equal(ready.state.native, null);
    results.checks.push('Open browser previews without starting a native app');
    await vscode.commands.executeCommand('dartnativePreview.sidebar');
    await until(() => api.snapshot()?.sidebarOpen);
    results.checks.push('Flutter-style sidebar opens beside source');
    const stream = JSON.parse(
      (
        await require('node:util').promisify(require('node:child_process').execFile)(
          process.execPath,
          [
            path.join(process.env.DN_TEST_TOOL, 'node_modules/serve-sim/dist/serve-sim.js'),
            '--list',
            ready.state.device,
          ],
          { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
        )
      ).stdout,
    );
    assert.equal(stream.running, false);
    results.checks.push('Browser preview starts no simulator stream');
    const lenses = await vscode.commands.executeCommand(
      'vscode.executeCodeLensProvider',
      document.uri,
    );
    assert.equal(
      lenses.filter((lens) => lens.command?.command === 'dartnativePreview.select').length,
      3,
    );
    results.checks.push('Three resolved source CodeLens actions');
    const target = ready.state.previews.find((p) => p.symbol === 'nativeFormPreview');
    await vscode.commands.executeCommand('dartnativePreview.select', target.id);
    await until(() => api.snapshot()?.state.selected === target.id);
    results.checks.push('Select fixture from source action');
    await vscode.commands.executeCommand('dartnativePreview.native', target.id);
    const native = await until(
      () => api.snapshot()?.state.status === 'ready' && api.snapshot()?.state.native,
    );
    results.initialPID = native.pid;
    results.checks.push('Explicit Run on iOS starts native rendering for the same fixture');
    const oldGeneration = api.snapshot().state.native.generation;
    await vscode.commands.executeCommand('dartnativePreview.reset');
    await until(() => api.snapshot()?.state.native.generation > oldGeneration);
    results.checks.push('Reset native widget without replacing process');
    await fs.writeFile(file, original + '\nfinal previewQaInvalid = missingPreviewQaValue;\n');
    await until(() =>
      vscode.languages
        .getDiagnostics(document.uri)
        .some(
          (d) => d.source === 'DartNative Preview' && d.message.includes('missingPreviewQaValue'),
        ),
    );
    assert.equal(api.snapshot().state.stale, true);
    results.checks.push('Source error appears in VS Code Problems with retained native output');
    await fs.writeFile(file, original);
    await until(
      () =>
        api.snapshot()?.state.status === 'ready' &&
        !vscode.languages
          .getDiagnostics(document.uri)
          .some((d) => d.source === 'DartNative Preview'),
    );
    assert.equal(api.snapshot().state.native.pid, results.initialPID);
    results.checks.push('Repair clears Problems and reloads in the same native process');
    if (process.env.DN_TEST_CHECKPOINT) {
      await fs.writeFile(process.env.DN_TEST_CHECKPOINT, JSON.stringify(api.snapshot()));
      await until(
        async () =>
          fs.access(process.env.DN_TEST_CHECKPOINT + '.continue').then(
            () => true,
            () => false,
          ),
        300000,
      );
    }
    await vscode.commands.executeCommand('dartnativePreview.stop');
    assert.equal(api.snapshot(), null);
    if (owned) {
      await until(async () => {
        try {
          await fs.access(path.join(project, '.dart_tool/dn-preview.lock'));
          return false;
        } catch {
          return true;
        }
      });
      assert.throws(() => process.kill(results.initialPID, 0));
      results.checks.push('Stop owned session removes project lock and native process');
    } else {
      const state = await fetch('http://127.0.0.1:5196/api/state').then((r) => r.json());
      assert.equal(state.native.pid, results.initialPID);
      assert.equal(state.status, 'ready');
      results.checks.push('Stop attached session leaves external controller and app running');
    }
    await vscode.commands.executeCommand('dartnativePreview.sidebar');
    await until(() => api.snapshot()?.sidebarOpen && api.snapshot()?.state.status === 'ready');
    results.checks.push('Reopen the existing sidebar after stopping the session');
    await fs.writeFile(process.env.DN_TEST_REPORT, JSON.stringify(results, null, 2));
    console.log('DARTNATIVE_IDE_QA_PASS', JSON.stringify(results));
  } finally {
    if ((await fs.readFile(file, 'utf8')) !== original) await fs.writeFile(file, original);
    await vscode.commands.executeCommand('dartnativePreview.stop');
  }
};
