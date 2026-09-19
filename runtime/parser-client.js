let worker;
let nextId = 0;
const pending = new Map();
function restart(error) {
  worker?.terminate();
  worker = null;
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  pending.clear();
}
export function parserRequest(operation, payload) {
  if (!worker) {
    worker = new Worker('/parser/worker.js');
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      clearTimeout(job.timer);
      data.error ? job.reject(Error(data.error)) : job.resolve(data.result);
    };
    worker.onerror = () => restart(Error('The parser could not start. Reload and try again.'));
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(
      () => restart(Error('Parsing took too long. Simplify the source and try again.')),
      15000,
    );
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, operation, payload });
  });
}
