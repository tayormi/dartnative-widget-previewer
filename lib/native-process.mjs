import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

async function executable(pid) {
  try {
    return (await exec('ps', ['-p', String(pid), '-o', 'comm='])).stdout.trim();
  } catch {
    return null;
  }
}
export function isSimulatorProcess(pid, command, device) {
  return (
    Number.isSafeInteger(pid) &&
    pid > 1 &&
    typeof command === 'string' &&
    command.includes(`/CoreSimulator/Devices/${device}/data/Containers/Bundle/Application/`) &&
    command.includes('.app/')
  );
}
export async function identifyNativeProcess(pid, device) {
  const command = await executable(pid);
  if (!isSimulatorProcess(pid, command, device))
    throw new Error('Cannot verify ownership of the native simulator process');
  return { pid, command };
}
export async function stopNativeProcess(identity) {
  if (!identity || (await executable(identity.pid)) !== identity.command) return;
  // dn can detach on terminal SIGINT before app.stop is delivered. Terminate
  // only the exact simulator process previously returned by our native host.
  try {
    process.kill(identity.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await executable(identity.pid)) !== identity.command) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if ((await executable(identity.pid)) === identity.command) process.kill(identity.pid, 'SIGKILL');
}
