// Await-for owns the subscription. Ending the loop or resetting the preview
// cancels it, including when the producer is waiting for its next event.
export async function* ownedStream(runtime, stream, epoch) {
  if (typeof stream?.[Symbol.asyncIterator] !== 'function')
    throw Error('await for requires an asynchronous stream.');
  const iterator = stream[Symbol.asyncIterator]();
  let rejectCancel,
    closed = false;
  const cancelled = new Promise((_, reject) => {
    rejectCancel = reject;
  });
  const close = () => {
    if (closed) return;
    closed = true;
    return iterator.return?.();
  };
  const cancel = () => {
    rejectCancel(Error('Preview stream was cancelled.'));
    Promise.resolve(close()).catch(() => {});
  };
  runtime.cleanups.add(cancel);
  try {
    while (true) {
      const event = await Promise.race([iterator.next(), cancelled]);
      if (runtime.disposed || runtime.epoch !== epoch) throw Error('Preview stream was cancelled.');
      if (event.done) {
        closed = true;
        return;
      }
      runtime.steps = 0;
      runtime.numericDeadline = null;
      yield event.value;
    }
  } finally {
    runtime.cleanups.delete(cancel);
    await close();
  }
}
