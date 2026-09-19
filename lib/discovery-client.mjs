import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export class DiscoveryClient {
  constructor(dart, script, project, sdk, cwd) {
    this.args = [dart, script, project, sdk, cwd];
    this.sequence = 0;
    this.pending = new Map();
  }
  start() {
    if (this.child) return;
    const [dart, script, project, sdk, cwd] = this.args;
    const child = (this.child = spawn(dart, ['run', script, project, sdk, '--serve'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }));
    const fail = (error) => {
      if (this.child !== child) return;
      this.child = null;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
    };
    createInterface({ input: child.stdout }).on('line', (line) => {
      let result;
      try {
        result = JSON.parse(line);
      } catch {
        return;
      }
      if (result.error && result.id == null) {
        fail(Error(result.error));
        child.kill();
        return;
      }
      const job = this.pending.get(result.id);
      if (!job) return;
      this.pending.delete(result.id);
      clearTimeout(job.timer);
      result.error ? job.reject(Error(result.error)) : job.resolve(result.result);
    });
    child.stderr.resume();
    child.stdin.on('error', fail);
    child.on('error', fail);
    child.on('exit', () => fail(Error('Preview analyzer stopped. Reload to retry.')));
  }
  scan() {
    this.start();
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.close();
      }, 60000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id }) + '\n');
    });
  }
  close() {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(Error('Preview analysis was interrupted. Reload to retry.'));
    }
    this.pending.clear();
    const child = this.child;
    this.child = null;
    child?.kill('SIGTERM');
  }
}
