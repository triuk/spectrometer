import {publish} from './events.js';
export const abortError = () => new DOMException('Operace byla zrušena.', 'AbortError');
export function createOperationController(onChange = () => {}) {
  let active = null;
  return {
    get active() { return active; },
    cancel() { active?.controller.abort(); },
    async run(kind, task) {
      if (active) {
        const error = new Error('Probíhá jiná operace kamery. Počkejte na její dokončení.');
        error.name = 'CameraBusyError';
        throw error;
      }
      const operation = {kind, controller: new AbortController()};
      operation.signal = operation.controller.signal;
      active = operation;
      onChange(active);
      try { return await task(operation); }
      catch (error) { operation.controller.abort(); throw error; }
      finally { if (active === operation) { active = null; onChange(null); } }
    },
  };
}
export const cameraOperations = createOperationController(operation => publish('camera-operation', operation?.kind ?? null));
export async function acquireMediaStream(request, {signal, timeoutMs = 30000} = {}) {
  if (signal?.aborted) throw abortError();
  let abandoned = false;
  const pending = Promise.resolve().then(() => {
    if (signal?.aborted) throw abortError();
    return request();
  }).then(stream => {
    if (abandoned || signal?.aborted) {
      stream.getTracks().forEach(track => track.stop());
      throw abortError();
    }
    return stream;
  });
  try { return await abortable(pending, signal, timeoutMs); }
  catch (error) { abandoned = true; throw error; }
}
export function abortable(promise, signal, timeoutMs = 5000) {
  if (signal?.aborted) {
    // Native requests may already exist; always consume their eventual rejection.
    Promise.resolve(promise).catch(() => {});
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, abortError());
    const timer = setTimeout(() => {
      const error = new Error("Kamera neodpověděla v časovém limitu."); error.name = "TimeoutError"; finish(reject,error);
    }, timeoutMs);
    signal?.addEventListener('abort', onAbort, {once:true});
    Promise.resolve(promise).then(value => finish(resolve,value), error => finish(reject,error));
  });
}
