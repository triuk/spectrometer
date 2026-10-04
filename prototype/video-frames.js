import {abortError} from './camera-operations.js';
export function waitForVideoFrame(video, {signal, track, timeoutMs = 5000} = {}) {
  if (signal?.aborted || track?.readyState === 'ended') return Promise.reject(abortError());
  return new Promise((resolve,reject) => {
    let callbackId, pollTimer, done = false;
    const baseline = video.currentTime;
    const cleanup = () => {
      clearTimeout(timeout); clearTimeout(pollTimer);
      if (callbackId !== undefined) video.cancelVideoFrameCallback?.(callbackId);
      signal?.removeEventListener('abort', onAbort);
      track?.removeEventListener('ended', onAbort);
      video.removeEventListener?.('error', onError);
    };
    const finish = (callback,value) => {if (done) return; done = true; cleanup(); callback(value);};
    const onAbort = () => finish(reject,abortError());
    const onError = () => finish(reject,new Error('Video snímání selhalo.'));
    const timeout = setTimeout(() => finish(reject,new Error('Kamera neposkytla nový snímek v časovém limitu.')),timeoutMs);
    signal?.addEventListener('abort',onAbort,{once:true});
    track?.addEventListener('ended',onAbort,{once:true});
    video.addEventListener?.('error',onError,{once:true});
    if (typeof video.requestVideoFrameCallback === 'function') {
      callbackId = video.requestVideoFrameCallback((now,metadata) => finish(resolve,{now,metadata}));
    } else {
      const poll = () => {
        if (video.currentTime !== baseline && video.readyState >= 2) {
          finish(resolve,{now:performance.now(),metadata:{mediaTime:video.currentTime}});
        } else pollTimer = setTimeout(poll,40);
      };
      poll();
    }
  });
}
